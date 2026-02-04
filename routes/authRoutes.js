const express = require('express');
const router = express.Router();
const { login, getCurrentUser } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/login - Login admin
router.post('/login', login);

// GET /api/auth/me - Get current user info (protected)
router.get('/me', authenticateToken, getCurrentUser);

module.exports = router;