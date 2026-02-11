const express = require('express');
const router = express.Router();
const { pool, query } = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// ============================================
// HELPER: Get full URL for images
// ============================================
function getFullImageUrl(req, relativePath) {
    // Remove leading slash if exists for consistency
    const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    
    // Get base URL from request or use environment variable
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    return `${baseUrl}/${cleanPath}`;
}

// ============================================
// MULTER CONFIGURATION FOR GALLERY IMAGES
// ============================================
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/gallery');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'gallery-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'));
        }
    }
});

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
                
                // ✅ Convert relative URLs to full URLs
                const imagesWithFullUrl = imagesResult.rows.map(img => ({
                    ...img,
                    image_url: getFullImageUrl(req, img.image_url)
                }));
                
                return {
                    ...project,
                    images: imagesWithFullUrl
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
            message: 'Failed to fetch gallery projects'
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
        
        const projectResult = await client.query(`
            INSERT INTO gallery_projects 
            (title, subtitle, description, vehicle_type, service_type, duration, completed_date, display_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [title, subtitle, description, vehicle_type, service_type, duration, completed_date, display_order]);
        
        const project = projectResult.rows[0];
        
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                // ✅ FIX: Tanpa leading slash
                const imageUrl = `uploads/gallery/${file.filename}`;
                const isPrimary = i === 0;
                
                await client.query(`
                    INSERT INTO gallery_images (project_id, image_url, image_order, is_primary)
                    VALUES ($1, $2, $3, $4)
                `, [project.id, imageUrl, i, isPrimary]);
            }
        }
        
        await client.query('COMMIT');
        
        const imagesResult = await client.query(`
            SELECT id, image_url, image_order, is_primary 
            FROM gallery_images 
            WHERE project_id = $1 
            ORDER BY image_order ASC
        `, [project.id]);
        
        // ✅ Convert relative URLs to full URLs
        const imagesWithFullUrl = imagesResult.rows.map(img => ({
            ...img,
            image_url: getFullImageUrl(req, img.image_url)
        }));
        
        res.json({
            status: 'success',
            message: 'Project created successfully',
            data: {
                ...project,
                images: imagesWithFullUrl
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create project'
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
        
        // Delete specified images
        if (deleted_images) {
            const imageIds = JSON.parse(deleted_images);
            if (imageIds.length > 0) {
                const imagesToDelete = await client.query(
                    'SELECT image_url FROM gallery_images WHERE id = ANY($1)',
                    [imageIds]
                );
                
                await client.query(
                    'DELETE FROM gallery_images WHERE id = ANY($1)',
                    [imageIds]
                );
                
                for (const img of imagesToDelete.rows) {
                    // Handle both formats: with or without leading slash
                    const cleanPath = img.image_url.startsWith('/') ? img.image_url.substring(1) : img.image_url;
                    const filePath = path.join(__dirname, '../public', cleanPath);
                    try {
                        await fs.unlink(filePath);
                    } catch (err) {
                        console.error('Failed to delete image file:', err);
                    }
                }
            }
        }
        
        // Add new images
        if (req.files && req.files.length > 0) {
            const maxOrderResult = await client.query(
                'SELECT COALESCE(MAX(image_order), -1) as max_order FROM gallery_images WHERE project_id = $1',
                [id]
            );
            let nextOrder = maxOrderResult.rows[0].max_order + 1;
            
            for (const file of req.files) {
                // ✅ FIX: Tanpa leading slash
                const imageUrl = `uploads/gallery/${file.filename}`;
                await client.query(`
                    INSERT INTO gallery_images (project_id, image_url, image_order, is_primary)
                    VALUES ($1, $2, $3, $4)
                `, [id, imageUrl, nextOrder++, false]);
            }
        }
        
        await client.query('COMMIT');
        
        const imagesResult = await client.query(`
            SELECT id, image_url, image_order, is_primary 
            FROM gallery_images 
            WHERE project_id = $1 
            ORDER BY image_order ASC
        `, [id]);
        
        // ✅ Convert relative URLs to full URLs
        const imagesWithFullUrl = imagesResult.rows.map(img => ({
            ...img,
            image_url: getFullImageUrl(req, img.image_url)
        }));
        
        res.json({
            status: 'success',
            message: 'Project updated successfully',
            data: {
                ...projectResult.rows[0],
                images: imagesWithFullUrl
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update project'
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
        
        const imagesResult = await pool.query(
            'SELECT image_url FROM gallery_images WHERE project_id = $1',
            [id]
        );
        
        for (const img of imagesResult.rows) {
            // Handle both formats: with or without leading slash
            const cleanPath = img.image_url.startsWith('/') ? img.image_url.substring(1) : img.image_url;
            const filePath = path.join(__dirname, '../public', cleanPath);
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.error('Failed to delete image file:', err);
            }
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
        
        res.json({
            status: 'success',
            message: 'Project deleted successfully'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete project'
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
        
        // ✅ Convert relative URLs to full URLs
        const imagesWithFullUrl = imagesResult.rows.map(img => ({
            ...img,
            image_url: getFullImageUrl(req, img.image_url)
        }));
        
        const project = {
            ...projectResult.rows[0],
            images: imagesWithFullUrl
        };
        
        res.json({
            status: 'success',
            data: project
        });
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch project'
        });
    }
});

module.exports = router;