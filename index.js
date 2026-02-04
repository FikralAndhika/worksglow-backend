const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import database
const pool = require('./config/db');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const servicesRoutes = require('./routes/servicesRoutes');
const heroRoutes = require('./routes/heroRoutes');
const contactRoutes = require('./routes/contactRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const aboutRoutes = require('./routes/aboutRoutes');

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS Configuration - Support Development & Production
const corsOptions = {
  origin: [
    // Local Development
    'http://localhost:5500',
    'http://localhost:5501',
    'http://localhost:3000',
    'http://localhost:5173',  // Vite default
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    
    // Production Frontend (Vercel)
    'https://worksglows.vercel.app',
    
    // Add more production domains if needed
    // 'https://www.worksglow.com',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ HANYA serve folder uploads untuk gambar/file
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Root Route - Health Check for Vercel
app.get('/', (req, res) => {
  res.json({ 
    message: 'Works Glow API Server',
    status: 'success',
    version: '1.0.0',
    endpoints: {
      test: '/api/test',
      auth: '/api/auth/*',
      services: '/api/services',
      hero: '/api/hero',
      contact: '/api/contact',
      gallery: '/api/gallery',
      about: '/api/about'
    }
  });
});

// Test Route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend Works Glow is running!',
    status: 'success' 
  });
});

// Test Database Connection Route
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      message: 'Database connected!',
      time: result.rows[0].now,
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Database connection failed',
      error: error.message,
      status: 'error'
    });
  }
});

// ============================================
// API ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/hero', heroRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/about', aboutRoutes);

// ============================================
// 404 Handler untuk route yang tidak ada
// ============================================
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.path
  });
});

// ============================================
// Error Handler
// ============================================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start Server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 WORKSGLOW BACKEND SERVER');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔌 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🖼️  Uploads URL: http://localhost:${PORT}/uploads`);
  console.log('='.repeat(50));
  console.log('📋 Available Endpoints:');
  console.log('   - GET  /api/test');
  console.log('   - GET  /api/db-test');
  console.log('   - POST /api/auth/*');
  console.log('   - GET  /api/services');
  console.log('   - GET  /api/hero');
  console.log('   - POST /api/contact');
  console.log('   - GET  /api/gallery');
  console.log('   - GET  /api/about');
  console.log('='.repeat(50));
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS Enabled for ${corsOptions.origin.length} origins`);
  console.log('='.repeat(50));
});