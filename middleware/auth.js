const jwt = require('jsonwebtoken');

// Middleware untuk verifikasi JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ 
      message: 'Access denied. No token provided.',
      status: 'error' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ 
      message: 'Invalid or expired token.',
      status: 'error' 
    });
  }
};

module.exports = { authenticateToken };