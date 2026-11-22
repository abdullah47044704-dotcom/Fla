-- ==========================================================
-- Trikstr Portfolio — Production SQL Database Schema
-- Compatible with: Neon PostgreSQL, Supabase, Vercel Postgres,
-- MySQL, SQLite, and Standard SQL engines.
-- ==========================================================

-- 1. Main Site Configuration Table (Stores Profile, Theme, Styles)
CREATE TABLE IF NOT EXISTS site_config (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'active',
    site_title VARCHAR(255) NOT NULL DEFAULT 'Trikstr Network',
    meta_description TEXT DEFAULT 'All my social links under one roof.',
    admin_password VARCHAR(255) NOT NULL DEFAULT '1234',
    avatar_url TEXT DEFAULT 'assets/images/image01.jpg',
    avatar_type VARCHAR(32) DEFAULT 'circle',
    avatar_size VARCHAR(32) DEFAULT '120px',
    avatar_radius VARCHAR(32) DEFAULT '50%',
    bio_text TEXT DEFAULT 'Animator | Motion Designer | 3D Artist',
    background_effect VARCHAR(64) DEFAULT 'matrix',
    background_color VARCHAR(32) DEFAULT '#000000',
    background_gradient TEXT DEFAULT 'linear-gradient(135deg, #0f0c1b 0%, #000000 50%, #15002b 100%)',
    button_text_color VARCHAR(32) DEFAULT '#FFFFFF',
    button_border_color VARCHAR(32) DEFAULT '#CCCCCC',
    button_bg_color VARCHAR(32) DEFAULT 'transparent',
    button_radius VARCHAR(32) DEFAULT '0.625rem',
    show_footer BOOLEAN DEFAULT TRUE,
    footer_text VARCHAR(255) DEFAULT 'Made with Carrd',
    footer_url TEXT DEFAULT 'https://carrd.com/build?ref=auto',
    show_admin_button BOOLEAN DEFAULT FALSE,
    config_data JSONB, -- Stores complete responsive object for fast atomic retrieval
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Social Links / Buttons Table (Relational button storage)
CREATE TABLE IF NOT EXISTS site_links (
    id VARCHAR(64) PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    icon VARCHAR(64) DEFAULT 'globe',
    hover_color VARCHAR(32) DEFAULT '#0071F2',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Admin Security & Audit Logs Table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(100),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- DEFAULT INITIAL SEED DATA
-- ==========================================================

-- Seed Initial Active Site Configuration
INSERT INTO site_config (
    id, site_title, meta_description, admin_password,
    avatar_url, avatar_type, avatar_size, avatar_radius,
    bio_text, background_effect, background_color,
    button_text_color, button_border_color, button_bg_color, button_radius,
    show_footer, footer_text, footer_url, show_admin_button,
    updated_at
) VALUES (
    'active',
    'Trikstr Network',
    'All my social links under one roof.',
    '1234',
    'assets/images/image01.jpg',
    'circle',
    '120px',
    '50%',
    'Animator | Motion Designer | 3D Artist',
    'matrix',
    '#000000',
    '#FFFFFF',
    '#CCCCCC',
    'transparent',
    '0.625rem',
    TRUE,
    'Made with Carrd',
    'https://carrd.com/build?ref=auto',
    FALSE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Seed Default 8 Social Buttons
INSERT INTO site_links (id, label, url, icon, hover_color, sort_order) VALUES
('btn-1', 'Discord (Trikstr Network®)', 'https://discord.gg/Euy4ES8dj', 'discord', '#0071F2', 1),
('btn-2', 'mawlana breakdown - Bangla', 'https://youtu.be/9HQDFKT9ewA', 'youtube-alt', '#FF9900', 2),
('btn-3', 'Mawlana Breakdown - English', 'https://youtu.be/luscJ3TDnvE', 'youtube-alt', '#FF9900', 3),
('btn-4', 'Latest Tutorial Up on Youtube!', 'https://bit.ly/4hpbDwx', 'info', '#FF1414', 4),
('btn-5', 'Instagram (32.6k+)', 'https://www.instagram.com/trikstrrr/?hl=en', 'instagram', '#FF63D3', 5),
('btn-6', 'Youtube (32.5k+)', 'https://www.youtube.com/c/TRIKSTREdits007/featured?sub_confirmation=1', 'youtube', '#FF1414', 6),
('btn-7', 'Twitter (1.1k+)', 'https://twitter.com/trikstrrr', 'twitter', '#00BAFF', 7),
('btn-8', 'Tiktok (1.3k+)', 'https://www.tiktok.com/@trikstr.ae', 'tiktok', '#FF2E74', 8)
ON CONFLICT (id) DO NOTHING;

-- Insert System Initial Log
INSERT INTO admin_audit_logs (action, details, ip_address)
VALUES ('DATABASE_INITIALIZED', '{"message": "SQL Database tables and default records seeded successfully."}', 'system');
