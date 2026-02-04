const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function initDatabase() {
  try {
    console.log('🔧 Initializing database...');
    
    // Baca file schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    await pool.query(schema);
    
    console.log('✅ Database tables created successfully!');
    
    // Insert default admin user
    await createDefaultAdmin();
    
    console.log('✅ Database initialization completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

async function createDefaultAdmin() {
  const bcrypt = require('bcryptjs');
  
  try {
    // Check if admin exists
    const checkAdmin = await pool.query(
      'SELECT * FROM admin_users WHERE username = $1',
      ['admin']
    );
    
    if (checkAdmin.rows.length === 0) {
      // Create default admin
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await pool.query(
        `INSERT INTO admin_users (username, email, password, full_name) 
         VALUES ($1, $2, $3, $4)`,
        ['admin', 'admin@worksglow.com', hashedPassword, 'Administrator']
      );
      
      console.log('✅ Default admin created!');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   ⚠️  PLEASE CHANGE PASSWORD AFTER FIRST LOGIN!');
    } else {
      console.log('ℹ️  Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Failed to create default admin:', error);
  }
}

initDatabase();