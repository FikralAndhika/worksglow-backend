-- =============================================
-- WORKSGLOW DATABASE SCHEMA
-- =============================================

-- 1. TABEL ADMIN USERS
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABEL HERO SLIDES (Homepage Slider)
CREATE TABLE IF NOT EXISTS hero_slides (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    subtitle VARCHAR(100),
    description TEXT,
    image_url VARCHAR(255),
    button_text VARCHAR(50),
    button_link VARCHAR(255),
    order_number INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABEL SERVICES (Layanan)
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    icon VARCHAR(50) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    order_number INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABEL GALLERY (Galeri Karya)
CREATE TABLE IF NOT EXISTS gallery (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    subtitle VARCHAR(100),
    description TEXT,
    date VARCHAR(50),
    service_type VARCHAR(100),
    duration VARCHAR(50),
    images TEXT[], -- Array untuk multiple images
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABEL ABOUT (Tentang Kami)
CREATE TABLE IF NOT EXISTS about (
    id SERIAL PRIMARY KEY,
    section VARCHAR(50) NOT NULL UNIQUE, -- 'history', 'vision', 'mission'
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABEL VALUES (Nilai-Nilai)
CREATE TABLE IF NOT EXISTS values (
    id SERIAL PRIMARY KEY,
    icon VARCHAR(50) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    order_number INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABEL STATS (Statistik)
CREATE TABLE IF NOT EXISTS stats (
    id SERIAL PRIMARY KEY,
    label VARCHAR(50) NOT NULL UNIQUE,
    value VARCHAR(20) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. TABEL CONTACT INFO
CREATE TABLE IF NOT EXISTS contact_info (
    id SERIAL PRIMARY KEY,
    field_name VARCHAR(50) NOT NULL UNIQUE, -- 'address', 'phone', 'email', 'hours'
    field_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. TABEL SOCIAL MEDIA
CREATE TABLE IF NOT EXISTS social_media (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL UNIQUE, -- 'instagram', 'whatsapp', 'tiktok', etc.
    url VARCHAR(255) NOT NULL,
    icon VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. TABEL FORM SUBMISSIONS (Pesan dari Contact Form)
CREATE TABLE IF NOT EXISTS form_submissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    service VARCHAR(100),
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'new', -- 'new', 'read', 'replied'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);