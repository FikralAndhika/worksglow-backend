const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../config/db');

// GET all services
router.get('/', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM services WHERE is_active = true ORDER BY service_order ASC'
        );

        res.json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch services',
            error: error.message
        });
    }
});

// GET single service by ID
router.get('/:id', async (req, res) => {
    try {
        const serviceId = parseInt(req.params.id);
        const result = await query(
            'SELECT * FROM services WHERE id = $1',
            [serviceId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Service not found'
            });
        }
        
        res.json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching service:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch service',
            error: error.message
        });
    }
});

// UPDATE all services (requires authentication)
router.post('/update', authenticateToken, async (req, res) => {
    try {
        const { services } = req.body;
        
        if (!services || !Array.isArray(services)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid services data'
            });
        }
        
        // Update each service
        for (let i = 0; i < services.length; i++) {
            const service = services[i];
            const serviceOrder = i + 1;

            await query(
                `UPDATE services 
                 SET icon = $1, title = $2, description = $3, updated_at = CURRENT_TIMESTAMP
                 WHERE service_order = $4`,
                [service.icon, service.title, service.description, serviceOrder]
            );
        }
        
        // Fetch updated data
        const result = await query(
            'SELECT * FROM services WHERE is_active = true ORDER BY service_order ASC'
        );
        
        res.json({
            status: 'success',
            message: 'Services updated successfully',
            data: result.rows
        });
    } catch (error) {
        console.error('Error updating services:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update services',
            error: error.message
        });
    }
});

// UPDATE single service (requires authentication)
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const serviceId = parseInt(req.params.id);
        const { icon, title, description, is_active } = req.body;
        
        // Check if service exists
        const checkResult = await query(
            'SELECT id FROM services WHERE id = $1',
            [serviceId]
        );
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Service not found'
            });
        }
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        if (icon !== undefined) {
            updates.push(`icon = $${paramCount++}`);
            values.push(icon);
        }
        if (title !== undefined) {
            updates.push(`title = $${paramCount++}`);
            values.push(title);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(is_active);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'No fields to update'
            });
        }
        
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(serviceId);
        
        await query(
            `UPDATE services SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
        );
        
        // Fetch updated service
        const result = await query(
            'SELECT * FROM services WHERE id = $1',
            [serviceId]
        );
        
        res.json({
            status: 'success',
            message: 'Service updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update service',
            error: error.message
        });
    }
});

// DELETE service (soft delete - requires authentication)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const serviceId = parseInt(req.params.id);
        
        // Check if service exists
        const checkResult = await query(
            'SELECT id FROM services WHERE id = $1',
            [serviceId]
        );
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Service not found'
            });
        }
        
        // Soft delete - set is_active to false
        await query(
            `UPDATE services 
             SET is_active = false, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [serviceId]
        );
        
        res.json({
            status: 'success',
            message: 'Service deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete service',
            error: error.message
        });
    }
});

module.exports = router;