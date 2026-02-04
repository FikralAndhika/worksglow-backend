const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth'); // ✅ DIPERBAIKI DI SINI
const { query } = require('../config/db');

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/hero');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'hero-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
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
router.post('/update', authenticateToken, upload.fields([ // ✅ DIPERBAIKI DI SINI
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

        // Update Slide 1
        let hero1ImageUrl = null;
        if (req.files && req.files['hero1Image']) {
            hero1ImageUrl = `/uploads/hero/${req.files['hero1Image'][0].filename}`;
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
            hero2ImageUrl = `/uploads/hero/${req.files['hero2Image'][0].filename}`;
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
            hero3ImageUrl = `/uploads/hero/${req.files['hero3Image'][0].filename}`;
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