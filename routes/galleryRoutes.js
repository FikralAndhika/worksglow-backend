const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
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
    if (!file) {
        console.log('⚠️ No file provided to uploadToBlob');
        return null;
    }
    
    try {
        console.log('🔧 Starting Blob upload...');
        console.log('📁 File:', file.originalname, `(${file.size} bytes)`);
        
        // Validate file buffer
        if (!file.buffer || file.buffer.length === 0) {
            throw new Error('File buffer is empty or undefined');
        }
        
        // Validate token
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            throw new Error('BLOB_READ_WRITE_TOKEN is not set');
        }
        
        const filename = `gallery-${Date.now()}-${Math.round(Math.random() * 1E9)}${file.originalname.substring(file.originalname.lastIndexOf('.'))}`;
        
        const blob = await put(filename, file.buffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        
        console.log('✅ Blob uploaded:', blob.url);
        
        return blob.url;
    } catch (error) {
        console.error('❌ BLOB UPLOAD ERROR:', error.message);
        throw new Error(`Blob upload failed: ${error.message}`);
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
        console.error('❌ Blob delete error:', error.message);
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
// UPDATE GALLERY PROJECT - IMPROVED & FIXED
// ============================================
router.post('/update/:id', upload.array('newImages', 10), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 UPDATE REQUEST');
        console.log('ID:', id);
        console.log('Body keys:', Object.keys(req.body));
        console.log('Files:', req.files?.length || 0);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // ✅ VALIDATE ID
        const projectId = parseInt(id);
        if (isNaN(projectId)) {
            throw new Error('Invalid project ID');
        }
        
        // ✅ CHECK IF PROJECT EXISTS
        const checkProject = await client.query(
            'SELECT id FROM gallery_projects WHERE id = $1',
            [projectId]
        );
        
        if (checkProject.rows.length === 0) {
            throw new Error(`Project ${projectId} not found`);
        }
        
        console.log('✅ Project exists');
        
        // ✅ PARSE DELETED IMAGES SAFELY
        let imageIdsToDelete = [];
        if (req.body.deleted_images) {
            try {
                const parsed = typeof req.body.deleted_images === 'string' 
                    ? JSON.parse(req.body.deleted_images)
                    : req.body.deleted_images;
                    
                if (Array.isArray(parsed)) {
                    imageIdsToDelete = parsed
                        .filter(id => !isNaN(parseInt(id)))
                        .map(id => parseInt(id));
                }
                console.log('🗑️ Images to delete:', imageIdsToDelete);
            } catch (e) {
                console.warn('⚠️ Failed to parse deleted_images:', e.message);
            }
        }
        
        // ✅ BUILD UPDATE QUERY DYNAMICALLY
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;
        
        const fields = [
            'title', 'subtitle', 'description', 
            'vehicle_type', 'service_type', 
            'duration', 'completed_date'
        ];
        
        fields.forEach(field => {
            if (req.body[field] !== undefined && req.body[field] !== '') {
                updateFields.push(`${field} = $${paramIndex++}`);
                updateValues.push(req.body[field]);
            }
        });
        
        // Handle display_order separately (numeric)
        if (req.body.display_order !== undefined && req.body.display_order !== '') {
            updateFields.push(`display_order = $${paramIndex++}`);
            updateValues.push(parseInt(req.body.display_order));
        }
        
        // ✅ UPDATE PROJECT METADATA
        let projectResult;
        if (updateFields.length > 0) {
            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            updateValues.push(projectId);
            
            const updateQuery = `
                UPDATE gallery_projects 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            console.log('📝 Executing update query');
            projectResult = await client.query(updateQuery, updateValues);
            console.log('✅ Metadata updated');
        } else {
            projectResult = await client.query(
                'SELECT * FROM gallery_projects WHERE id = $1',
                [projectId]
            );
            console.log('ℹ️ No metadata changes');
        }
        
        // ✅ DELETE SPECIFIED IMAGES
        if (imageIdsToDelete.length > 0) {
            const imagesToDelete = await client.query(
                'SELECT image_url FROM gallery_images WHERE id = ANY($1::int[]) AND project_id = $2',
                [imageIdsToDelete, projectId]
            );
            
            if (imagesToDelete.rows.length > 0) {
                await client.query(
                    'DELETE FROM gallery_images WHERE id = ANY($1::int[]) AND project_id = $2',
                    [imageIdsToDelete, projectId]
                );
                
                // Delete from Blob (async, don't block)
                imagesToDelete.rows.forEach(img => {
                    deleteFromBlob(img.image_url).catch(err => 
                        console.error('Blob delete failed:', err.message)
                    );
                });
                
                console.log(`✅ Deleted ${imagesToDelete.rows.length} images`);
            }
        }
        
        // ✅ UPLOAD NEW IMAGES
        if (req.files && req.files.length > 0) {
            console.log(`📸 Uploading ${req.files.length} new images...`);
            
            const maxOrderResult = await client.query(
                'SELECT COALESCE(MAX(image_order), -1) as max_order FROM gallery_images WHERE project_id = $1',
                [projectId]
            );
            let nextOrder = maxOrderResult.rows[0].max_order + 1;
            
            let uploadedCount = 0;
            for (const file of req.files) {
                try {
                    const imageUrl = await uploadToBlob(file);
                    if (imageUrl) {
                        await client.query(
                            'INSERT INTO gallery_images (project_id, image_url, image_order, is_primary) VALUES ($1, $2, $3, $4)',
                            [projectId, imageUrl, nextOrder++, false]
                        );
                        uploadedCount++;
                    }
                } catch (uploadErr) {
                    console.error('Image upload failed:', uploadErr.message);
                }
            }
            console.log(`✅ Uploaded ${uploadedCount}/${req.files.length} images`);
        }
        
        await client.query('COMMIT');
        console.log('✅ Transaction committed');
        
        // ✅ FETCH FINAL DATA
        const imagesResult = await client.query(
            'SELECT id, image_url, image_order, is_primary FROM gallery_images WHERE project_id = $1 ORDER BY image_order ASC',
            [projectId]
        );
        
        console.log(`📊 Final: ${imagesResult.rows.length} images`);
        
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
        console.error('❌ UPDATE ERROR:', error.message);
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
        
        const imagesResult = await client.query(
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