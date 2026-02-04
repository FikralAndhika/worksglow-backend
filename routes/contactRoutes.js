const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth'); // ✅ DIPERBAIKI
const { query } = require('../config/db');

// GET - Get contact information
router.get('/', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM contact_info ORDER BY id DESC LIMIT 1'
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Contact information not found'
            });
        }

        // Map database fields to frontend expected format
        const contactData = {
            address: result.rows[0].address,
            phone: result.rows[0].phone,
            email: result.rows[0].email,
            hours: result.rows[0].working_hours,
            mapsLink: result.rows[0].maps_link,
            whatsapp: result.rows[0].whatsapp_link?.replace('https://wa.me/', '') || result.rows[0].phone.replace(/\D/g, '')
        };

        res.json({
            status: 'success',
            data: contactData
        });
    } catch (error) {
        console.error('Error fetching contact info:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch contact information'
        });
    }
});

// POST - Update contact information (with authentication)
router.post('/update', authenticateToken, async (req, res) => { // ✅ DIPERBAIKI
    try {
        const { address, phone, email, hours, mapsLink, whatsapp } = req.body;

        // Validate required fields
        if (!address || !phone || !email || !hours) {
            return res.status(400).json({
                status: 'error',
                message: 'Address, phone, email, and hours are required'
            });
        }

        // Format WhatsApp link
        const whatsappLink = whatsapp.startsWith('http') 
            ? whatsapp 
            : `https://wa.me/${whatsapp.replace(/\D/g, '')}`;

        // Check if contact info exists
        const checkResult = await query('SELECT id FROM contact_info LIMIT 1');

        if (checkResult.rows.length === 0) {
            // Insert new contact info
            await query(
                `INSERT INTO contact_info (address, phone, email, working_hours, maps_link, whatsapp_link)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [address, phone, email, hours, mapsLink, whatsappLink]
            );
        } else {
            // Update existing contact info
            await query(
                `UPDATE contact_info 
                 SET address = $1, phone = $2, email = $3, working_hours = $4, 
                     maps_link = $5, whatsapp_link = $6, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $7`,
                [address, phone, email, hours, mapsLink, whatsappLink, checkResult.rows[0].id]
            );
        }

        // Fetch updated data
        const result = await query(
            'SELECT * FROM contact_info ORDER BY id DESC LIMIT 1'
        );

        res.json({
            status: 'success',
            message: 'Contact information updated successfully',
            data: {
                address: result.rows[0].address,
                phone: result.rows[0].phone,
                email: result.rows[0].email,
                hours: result.rows[0].working_hours,
                mapsLink: result.rows[0].maps_link,
                whatsapp: result.rows[0].whatsapp_link?.replace('https://wa.me/', '') || result.rows[0].phone.replace(/\D/g, '')
            }
        });

    } catch (error) {
        console.error('Error updating contact info:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update contact information',
            error: error.message
        });
    }
});

module.exports = router;