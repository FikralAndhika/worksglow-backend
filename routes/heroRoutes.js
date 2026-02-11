const express = require('express');
const router = express.Router();
const multer = require('multer');
const { put } = require('@vercel/blob');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../config/db');

// Configure multer for memory storage (instead of disk)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// GET - Get all hero slides
router.get('/', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM hero_slides WHERE is_active = true ORDER BY slide_order ASC'
        );

        const heroData = {
            slide1: result.rows.find(r => r.slide_order === 1) || {},
            slide2: result.rows.find(r => r.slide_order === 2) || {},
            slide3: result.rows.find(r => r.slide_order === 3) || {}
        };

        res.json({
            status: 'success',
            data: heroData
        });
    } catch (error) {
        console.error('Error fetching hero data:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch hero data'
        });
    }
});

// POST - Update hero section (with authentication)
router.post('/update', authenticateToken, upload.fields([
    { name: 'hero1Image', maxCount: 1 },
    { name: 'hero2Image', maxCount: 1 },
    { name: 'hero3Image', maxCount: 1 }
]), async (req, res) => {
    try {
        const {
            hero1Subtitle, hero1Title, hero1Description,
            hero2Subtitle, hero2Title, hero2Description,
            hero3Subtitle, hero3Title, hero3Description
        } = req.body;

        // Helper function to upload to Vercel Blob
        async function uploadToBlob(file) {
            if (!file) return null;
            
            try {
                const filename = `hero-${Date.now()}-${Math.round(Math.random() * 1E9)}${file.originalname.substring(file.originalname.lastIndexOf('.'))}`;
                const blob = await put(filename, file.buffer, {
                    access: 'public',
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                });
                return blob.url;
            } catch (error) {
                console.error('Blob upload error:', error);
                return null;
            }
        }

        // Update Slide 1
        let hero1ImageUrl = null;
        if (req.files && req.files['hero1Image']) {
            hero1ImageUrl = await uploadToBlob(req.files['hero1Image'][0]);
        }

        await query(
            `UPDATE hero_slides 
             SET subtitle = $1, title = $2, description = $3, 
                 image_url = COALESCE($4, image_url),
                 updated_at = CURRENT_TIMESTAMP
             WHERE slide_order = 1`,
            [hero1Subtitle, hero1Title, hero1Description, hero1ImageUrl]
        );

        // Update Slide 2
        let hero2ImageUrl = null;
        if (req.files && req.files['hero2Image']) {
            hero2ImageUrl = await uploadToBlob(req.files['hero2Image'][0]);
        }

        await query(
            `UPDATE hero_slides 
             SET subtitle = $1, title = $2, description = $3,
                 image_url = COALESCE($4, image_url),
                 updated_at = CURRENT_TIMESTAMP
             WHERE slide_order = 2`,
            [hero2Subtitle, hero2Title, hero2Description, hero2ImageUrl]
        );

        // Update Slide 3
        let hero3ImageUrl = null;
        if (req.files && req.files['hero3Image']) {
            hero3ImageUrl = await uploadToBlob(req.files['hero3Image'][0]);
        }

        await query(
            `UPDATE hero_slides 
             SET subtitle = $1, title = $2, description = $3,
                 image_url = COALESCE($4, image_url),
                 updated_at = CURRENT_TIMESTAMP
             WHERE slide_order = 3`,
            [hero3Subtitle, hero3Title, hero3Description, hero3ImageUrl]
        );

        // Fetch updated data
        const result = await query(
            'SELECT * FROM hero_slides WHERE is_active = true ORDER BY slide_order ASC'
        );

        res.json({
            status: 'success',
            message: 'Hero section updated successfully',
            data: {
                slide1: result.rows.find(r => r.slide_order === 1),
                slide2: result.rows.find(r => r.slide_order === 2),
                slide3: result.rows.find(r => r.slide_order === 3)
            }
        });

    } catch (error) {
        console.error('Error updating hero data:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update hero section',
            error: error.message
        });
    }
});

module.exports = router;