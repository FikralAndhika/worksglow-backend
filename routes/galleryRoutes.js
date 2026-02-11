const express = require('express');
const router = express.Router();
const { pool } = require('../config/db'); // ✅ DESTRUCTURE because db.js exports { pool, query }
const multer = require('multer');
const { put, del } = require('@vercel/blob');

// ============================================
// MULTER CONFIGURATION FOR GALLERY IMAGES
// ============================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'));
        }
    }
});

// ============================================
// HELPER: Upload to Vercel Blob
// ============================================
async function uploadToBlob(file) {
    if (!file) return null;
    
    try {
        console.log('🔧 Uploading to Blob...');
        console.log('📁 File:', file.originalname);
        console.log('🔑 Token exists:', !!process.env.BLOB_READ_WRITE_TOKEN);
        
        const filename = `gallery-${Date.now()}-${Math.round(Math.random() * 1E9)}${file.originalname.substring(file.originalname.lastIndexOf('.'))}`;
        
        const blob = await put(filename, file.buffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        
        console.log('✅ Blob uploaded:', blob.url);
        return blob.url;
    } catch (error) {
        console.error('❌ Blob upload error:', error);
        throw error;
    }
}

// ============================================
// HELPER: Delete from Vercel Blob
// ============================================
async function deleteFromBlob(url) {
    if (!url) return;
    
    try {
        console.log('🗑️ Deleting from Blob:', url);
        await del(url, {
            token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        console.log('✅ Blob deleted');
    } catch (error) {
        console.error('❌ Blob delete error:', error);
    }
}

// ============================================
// GET ALL GALLERY PROJECTS (PUBLIC)
// ============================================
router.get('/', async (req, res) => {
    try {
        const projectsResult = await pool.query(`
            SELECT * FROM gallery_projects 
            WHERE is_active = true 
            ORDER BY display_order ASC, created_at DESC
        `);
        
        const projects = await Promise.all(
            projectsResult.rows.map(async (project) => {
                const imagesResult = await pool.query(`
                    SELECT id, image_url, image_order, is_primary 
                    FROM gallery_images 
                    WHERE project_id = $1 
                    ORDER BY image_order ASC
                `, [project.id]);
                
                return {
                    ...project,
                    images: imagesResult.rows
                };
            })
        );
        
        res.json({
            status: 'success',
            data: projects
        });
    } catch (error) {
        console.error('Error fetching gallery:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch gallery projects',
            error: error.message
        });
    }
});

// ============================================
// CREATE NEW GALLERY PROJECT
// ============================================
router.post('/create', upload.array('images', 10), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            title,
            subtitle,
            description,
            vehicle_type,
            service_type,
            duration,
            completed_date,
            display_order = 0
        } = req.body;
        
        console.log('📝 Creating project:', { title, subtitle });
        
        const projectResult = await client.query(`
            INSERT INTO gallery_projects 
            (title, subtitle, description, vehicle_type, service_type, duration, completed_date, display_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [title, subtitle, description, vehicle_type, service_type, duration, completed_date, display_order]);
        
        const project = projectResult.rows[0];
        console.log('✅ Project created with ID:', project.id);
        
        // Upload images to Vercel Blob
        if (req.files && req.files.length > 0) {
            console.log(`📸 Uploading ${req.files.length} images...`);
            
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const imageUrl = await uploadToBlob(file);
                
                if (imageUrl) {
                    const isPrimary = i === 0;
                    await client.query(`
                        INSERT INTO gallery_images (project_id, image_url, image_order, is_primary)
                        VALUES ($1, $2, $3, $4)
                    `, [project.id, imageUrl, i, isPrimary]);
                    console.log(`✅ Image ${i + 1} saved to DB`);
                }
            }
        }
        
        await client.query('COMMIT');
        console.log('✅ Transaction committed');
        
        const imagesResult = await client.query(`
            SELECT id, image_url, image_order, is_primary 
            FROM gallery_images 
            WHERE project_id = $1 
            ORDER BY image_order ASC
        `, [project.id]);
        
        res.json({
            status: 'success',
            message: 'Project created successfully',
            data: {
                ...project,
                images: imagesResult.rows
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error creating project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create project',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// ============================================
// UPDATE GALLERY PROJECT - IMPROVED VERSION
// ============================================
router.post('/update/:id', upload.array('newImages', 10), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const {
            title,
            subtitle,
            description,
            vehicle_type,
            service_type,
            duration,
            completed_date,
            display_order,
            deleted_images
        } = req.body;
        
        // ✅ DETAILED LOGGING
        console.log('📝 Update Request for ID:', id);
        console.log('📋 Data:', {
            title,
            subtitle,
            description,
            vehicle_type,
            service_type,
            duration,
            completed_date,
            display_order,
            has_new_images: !!(req.files && req.files.length),
            files_count: req.files ? req.files.length : 0,
            deleted_images
        });
        
        // ✅ CHECK IF PROJECT EXISTS FIRST
        const checkProject = await client.query(
            'SELECT id FROM gallery_projects WHERE id = $1',
            [id]
        );
        
        if (checkProject.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                status: 'error',
                message: `Project with ID ${id} not found`
            });
        }
        
        console.log('✅ Project exists, proceeding with update');
        
        // ✅ IMPROVED UPDATE QUERY WITH COALESCE
        const projectResult = await client.query(`
            UPDATE gallery_projects 
            SET 
                title = COALESCE($1, title),
                subtitle = COALESCE($2, subtitle),
                description = COALESCE($3, description),
                vehicle_type = COALESCE($4, vehicle_type),
                service_type = COALESCE($5, service_type),
                duration = COALESCE($6, duration),
                completed_date = COALESCE($7, completed_date),
                display_order = COALESCE($8::INTEGER, display_order),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [
            title || null,
            subtitle || null,
            description || null,
            vehicle_type || null,
            service_type || null,
            duration || null,
            completed_date || null,
            display_order !== undefined && display_order !== '' ? parseInt(display_order) : null,
            id
        ]);
        
        console.log('✅ Project metadata updated');
        
        // ✅ DELETE SPECIFIED IMAGES WITH ERROR HANDLING
        if (deleted_images) {
            try {
                const imageIds = JSON.parse(deleted_images);
                if (Array.isArray(imageIds) && imageIds.length > 0) {
                    console.log(`🗑️ Deleting ${imageIds.length} images:`, imageIds);
                    
                    const imagesToDelete = await client.query(
                        'SELECT image_url FROM gallery_images WHERE id = ANY($1) AND project_id = $2',
                        [imageIds, id]
                    );
                    
                    console.log(`🔍 Found ${imagesToDelete.rows.length} images to delete`);
                    
                    if (imagesToDelete.rows.length > 0) {
                        await client.query(
                            'DELETE FROM gallery_images WHERE id = ANY($1) AND project_id = $2',
                            [imageIds, id]
                        );
                        
                        // Delete from Blob storage
                        for (const img of imagesToDelete.rows) {
                            await deleteFromBlob(img.image_url);
                        }
                        
                        console.log('✅ Images deleted from DB and Blob');
                    }
                }
            } catch (parseError) {
                console.error('⚠️ Error processing deleted_images:', parseError);
                // Don't fail the whole request
            }
        }
        
        // ✅ ADD NEW IMAGES WITH BETTER ERROR HANDLING
        if (req.files && req.files.length > 0) {
            console.log(`📸 Processing ${req.files.length} new images...`);
            
            const maxOrderResult = await client.query(
                'SELECT COALESCE(MAX(image_order), -1) as max_order FROM gallery_images WHERE project_id = $1',
                [id]
            );
            let nextOrder = maxOrderResult.rows[0].max_order + 1;
            
            console.log(`📊 Next image order will be: ${nextOrder}`);
            
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                try {
                    console.log(`📤 Uploading image ${i + 1}/${req.files.length}: ${file.originalname}`);
                    
                    const imageUrl = await uploadToBlob(file);
                    
                    if (imageUrl) {
                        await client.query(`
                            INSERT INTO gallery_images (project_id, image_url, image_order, is_primary)
                            VALUES ($1, $2, $3, $4)
                        `, [id, imageUrl, nextOrder++, false]);
                        
                        console.log(`✅ Image ${i + 1} uploaded and saved: ${imageUrl}`);
                    }
                } catch (uploadError) {
                    console.error(`❌ Error uploading image ${i + 1}:`, uploadError);
                    // Continue with other images
                }
            }
            
            console.log('✅ All new images processed');
        }
        
        await client.query('COMMIT');
        console.log('✅ Transaction committed successfully');
        
        // Fetch updated data
        const imagesResult = await client.query(`
            SELECT id, image_url, image_order, is_primary 
            FROM gallery_images 
            WHERE project_id = $1 
            ORDER BY image_order ASC
        `, [id]);
        
        console.log(`📊 Project now has ${imagesResult.rows.length} images`);
        
        res.json({
            status: 'success',
            message: 'Project updated successfully',
            data: {
                ...projectResult.rows[0],
                images: imagesResult.rows
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ CRITICAL ERROR updating project:', error);
        console.error('Stack:', error.stack);
        
        res.status(500).json({
            status: 'error',
            message: 'Failed to update project',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        client.release();
    }
});

// ============================================
// DELETE GALLERY PROJECT
// ============================================
router.delete('/delete/:id', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        
        console.log('🗑️ Deleting project ID:', id);
        
        const imagesResult = await pool.query(
            'SELECT image_url FROM gallery_images WHERE project_id = $1',
            [id]
        );
        
        console.log(`🗑️ Found ${imagesResult.rows.length} images to delete`);
        
        // Delete images from Blob storage
        for (const img of imagesResult.rows) {
            await deleteFromBlob(img.image_url);
        }
        
        const deleteResult = await client.query(
            'DELETE FROM gallery_projects WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (deleteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                status: 'error',
                message: 'Project not found'
            });
        }
        
        await client.query('COMMIT');
        console.log('✅ Project deleted successfully');
        
        res.json({
            status: 'success',
            message: 'Project deleted successfully'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error deleting project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete project',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// ============================================
// GET SINGLE GALLERY PROJECT BY ID
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const projectResult = await pool.query(
            'SELECT * FROM gallery_projects WHERE id = $1',
            [id]
        );
        
        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Project not found'
            });
        }
        
        const imagesResult = await pool.query(`
            SELECT id, image_url, image_order, is_primary 
            FROM gallery_images 
            WHERE project_id = $1 
            ORDER BY image_order ASC
        `, [id]);
        
        const project = {
            ...projectResult.rows[0],
            images: imagesResult.rows
        };
        
        res.json({
            status: 'success',
            data: project
        });
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch project',
            error: error.message
        });
    }
});

module.exports = router;