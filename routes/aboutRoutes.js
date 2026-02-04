const express = require('express');
const router = express.Router();
const { pool } = require('../config/db'); // ✅ Destructure pool from export
const jwt = require('jsonwebtoken');

// ============================================
// AUTH MIDDLEWARE
// ============================================
const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({
                status: 'error',
                message: 'No token provided'
            });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid token format'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('❌ Token verification error:', error.message);
        return res.status(401).json({
            status: 'error',
            message: 'Invalid or expired token'
        });
    }
};

// ============================================
// GET ALL ABOUT US CONTENT (PUBLIC)
// ============================================
router.get('/', async (req, res) => {
    try {
        console.log('📥 GET /api/about - Fetching all content');
        
        const result = await pool.query(`
            SELECT section, content 
            FROM about_content 
            ORDER BY 
                CASE section
                    WHEN 'hero' THEN 1
                    WHEN 'history' THEN 2
                    WHEN 'vision' THEN 3
                    WHEN 'mission' THEN 4
                    WHEN 'values' THEN 5
                    WHEN 'stats' THEN 6
                    ELSE 7
                END
        `);
        
        console.log(`✅ Found ${result.rows.length} sections`);
        
        const aboutData = {};
        result.rows.forEach(row => {
            // PostgreSQL JSONB auto-parse jadi object
            aboutData[row.section] = typeof row.content === 'string' 
                ? JSON.parse(row.content) 
                : row.content;
        });
        
        res.json({
            status: 'success',
            data: aboutData
        });
    } catch (error) {
        console.error('❌ Error fetching about content:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch about content',
            error: error.message
        });
    }
});

// ============================================
// UPDATE MULTIPLE SECTIONS (AUTH REQUIRED)
// ============================================
router.post('/update-all', verifyToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        console.log('='.repeat(60));
        console.log('📥 POST /api/about/update-all - START');
        console.log('='.repeat(60));
        
        await client.query('BEGIN');
        
        // Log raw body
        console.log('📦 Raw req.body:', JSON.stringify(req.body, null, 2));
        
        const { sections } = req.body;
        
        // ✅ VALIDASI 1: sections harus ada
        if (!sections) {
            console.log('❌ Validation failed: sections is missing');
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'Body harus berformat: { sections: { sectionName: contentObject } }',
                received: req.body
            });
        }
        
        // ✅ VALIDASI 2: sections harus object (bukan array atau string)
        console.log('🔍 Type check:', {
            type: typeof sections,
            isArray: Array.isArray(sections),
            isObject: typeof sections === 'object',
            keys: Object.keys(sections || {})
        });
        
        if (typeof sections !== 'object' || Array.isArray(sections)) {
            console.log('❌ Validation failed: sections is not an object');
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'sections harus berupa object, bukan array atau string',
                received: {
                    type: typeof sections,
                    isArray: Array.isArray(sections),
                    value: sections
                }
            });
        }
        
        // ✅ VALIDASI 3: sections tidak boleh kosong
        const sectionKeys = Object.keys(sections);
        console.log('📋 Section keys:', sectionKeys);
        
        if (sectionKeys.length === 0) {
            console.log('❌ Validation failed: sections object is empty');
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'Sections object tidak boleh kosong'
            });
        }
        
        const updatedSections = [];
        
        // ✅ PROCESS EACH SECTION
        for (const [sectionName, sectionContent] of Object.entries(sections)) {
            console.log('-'.repeat(50));
            console.log(`📝 Processing section: "${sectionName}"`);
            
            // Validasi section name: hanya huruf kecil dan underscore
            if (!/^[a-z_]+$/.test(sectionName)) {
                console.log(`❌ Invalid section name: "${sectionName}"`);
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: 'error',
                    message: `Invalid section name: "${sectionName}". Hanya huruf kecil dan underscore yang diizinkan.`
                });
            }
            
            // Validasi content harus object
            if (!sectionContent || typeof sectionContent !== 'object' || Array.isArray(sectionContent)) {
                console.log(`❌ Invalid content type for "${sectionName}":`, typeof sectionContent);
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: 'error',
                    message: `Content untuk section "${sectionName}" harus berupa object`,
                    received: {
                        type: typeof sectionContent,
                        isArray: Array.isArray(sectionContent),
                        value: sectionContent
                    }
                });
            }
            
            // Stringify content
            let contentJson;
            try {
                contentJson = JSON.stringify(sectionContent);
                console.log(`✅ Content stringified (${contentJson.length} chars)`);
                // Log sample of content
                console.log('📄 Content preview:', contentJson.substring(0, 100) + '...');
            } catch (stringifyError) {
                console.error(`❌ JSON.stringify error for "${sectionName}":`, stringifyError);
                await client.query('ROLLBACK');
                return res.status(400).json({
                    status: 'error',
                    message: `Failed to stringify content for "${sectionName}"`,
                    error: stringifyError.message
                });
            }
            
            // Insert/Update database
            try {
                console.log(`💾 Inserting/updating database for "${sectionName}"...`);
                
                const result = await client.query(`
                    INSERT INTO about_content (section, content, updated_at)
                    VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
                    ON CONFLICT (section) 
                    DO UPDATE SET 
                        content = EXCLUDED.content,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING section, updated_at
                `, [sectionName, contentJson]);
                
                console.log(`✅ Section "${sectionName}" saved to database`);
                
                updatedSections.push({
                    section: result.rows[0].section,
                    updated_at: result.rows[0].updated_at
                });
                
            } catch (queryError) {
                console.error(`❌ Database query error for "${sectionName}":`, queryError);
                console.error('Query details:', {
                    code: queryError.code,
                    detail: queryError.detail,
                    hint: queryError.hint
                });
                await client.query('ROLLBACK');
                return res.status(500).json({
                    status: 'error',
                    message: `Database error for section "${sectionName}"`,
                    error: queryError.message,
                    detail: queryError.detail
                });
            }
        }
        
        // Commit transaction
        await client.query('COMMIT');
        
        console.log('='.repeat(60));
        console.log('✅ All sections updated successfully!');
        console.log('Updated sections:', updatedSections.map(s => s.section).join(', '));
        console.log('='.repeat(60));
        
        res.json({
            status: 'success',
            message: 'All sections updated successfully',
            data: updatedSections
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Unexpected error in /update-all:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update sections',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        client.release();
    }
});

// ============================================
// UPDATE SINGLE SECTION (AUTH REQUIRED)
// ============================================
router.post('/update', verifyToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        console.log('📥 POST /api/about/update - Single section update');
        
        await client.query('BEGIN');
        
        const { section, content } = req.body;
        
        if (!section || !content) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                status: 'error',
                message: 'Section dan content wajib ada'
            });
        }
        
        const contentJson = typeof content === 'string' ? content : JSON.stringify(content);
        
        const result = await client.query(`
            INSERT INTO about_content (section, content, updated_at)
            VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (section) 
            DO UPDATE SET 
                content = EXCLUDED.content,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [section, contentJson]);
        
        await client.query('COMMIT');
        
        console.log(`✅ Section "${section}" updated successfully`);
        
        res.json({
            status: 'success',
            message: 'About content updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error updating about content:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update about content',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// ============================================
// GET SPECIFIC SECTION (PUBLIC)
// ⚠️ Taruh TERAKHIR karena /:section akan match semua path
// ============================================
router.get('/:section', async (req, res) => {
    try {
        const { section } = req.params;
        
        console.log(`📥 GET /api/about/${section}`);
        
        const result = await pool.query(
            'SELECT section, content FROM about_content WHERE section = $1',
            [section]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `Section "${section}" not found`
            });
        }
        
        const content = typeof result.rows[0].content === 'string'
            ? JSON.parse(result.rows[0].content)
            : result.rows[0].content;
        
        console.log(`✅ Section "${section}" found`);
        
        res.json({
            status: 'success',
            data: content
        });
    } catch (error) {
        console.error('❌ Error fetching section:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch section',
            error: error.message
        });
    }
});

module.exports = router;