const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // ✅ FIXED: Removed destructuring
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
        // ✅ ADD LOGGING FOR DEBUG
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
        throw error; // ✅ THROW ERROR instead of returning null
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
        // Don't throw, just log - deletion errors shouldn't block the request
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
            error: error.message // ✅ ADD ERROR DETAILS
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
            error: error.message // ✅ ADD ERROR DETAILS
        });
    } finally {
        client.release();
    }
});

// ============================================
// UPDATE GALLERY PROJECT
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
        
        console.log('📝 Updating project ID:', id);
        
        // Update project
        const projectResult = await client.query(`
            UPDATE gallery_projects 
            SET title = $1, subtitle = $2, description = $3, vehicle_type = $4,
                service_type = $5, duration = $6, completed_date = $7, display_order = $8,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [title, subtitle, description, vehicle_type, service_type, duration, completed_date, display_order, id]);
        
        if (projectResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                status: 'error',
                message: 'Project not found'
            });
        }
        
        console.log('✅ Project updated');
        
        // Delete specified images
        if (deleted_images) {
            const imageIds = JSON.parse(deleted_images);
            if (imageIds.length > 0) {
                console.log(`🗑️ Deleting ${imageIds.length} images...`);
                
                const imagesToDelete = await client.query(
                    'SELECT image_url FROM gallery_images WHERE id = ANY($1)',
                    [imageIds]
                );
                
                await client.query(
                    'DELETE FROM gallery_images WHERE id = ANY($1)',
                    [imageIds]
                );
                
                // Delete from Blob storage
                for (const img of imagesToDelete.rows) {
                    await deleteFromBlob(img.image_url);
                }
                
                console.log('✅ Images deleted');
            }
        }
        
        // Add new images
        if (req.files && req.files.length > 0) {
            console.log(`📸 Adding ${req.files.length} new images...`);
            
            const maxOrderResult = await client.query(
                'SELECT COALESCE(MAX(image_order), -1) as max_order FROM gallery_images WHERE project_id = $1',
                [id]
            );
            let nextOrder = maxOrderResult.rows[0].max_order + 1;
            
            for (const file of req.files) {
                const imageUrl = await uploadToBlob(file);
                
                if (imageUrl) {
                    await client.query(`
                        INSERT INTO gallery_images (project_id, image_url, image_order, is_primary)
                        VALUES ($1, $2, $3, $4)
                    `, [id, imageUrl, nextOrder++, false]);
                }
            }
            
            console.log('✅ New images added');
        }
        
        await client.query('COMMIT');
        console.log('✅ Transaction committed');
        
        const imagesResult = await client.query(`
            SELECT id, image_url, image_order, is_primary 
            FROM gallery_images 
            WHERE project_id = $1 
            ORDER BY image_order ASC
        `, [id]);
        
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
        console.error('❌ Error updating project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update project',
            error: error.message // ✅ ADD ERROR DETAILS
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
            error: error.message // ✅ ADD ERROR DETAILS
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
            error: error.message // ✅ ADD ERROR DETAILS
        });
    }
});

module.exports = router;