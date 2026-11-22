/**
 * api/db.js — Advanced SQL Database Engine (PostgreSQL / Neon / Supabase)
 * Features:
 * - Auto-migration: Creates 'site_config' and 'admin_audit_logs' tables automatically.
 * - Auto-seeding: Automatically seeds default site config on first run.
 * - JSONB storage: High performance atomic storage for site configurations.
 * - Audit logs: Tracks admin changes with timestamps and IP records.
 * - Multi-provider support: Neon, Supabase, Vercel Postgres, AWS RDS, Railway, Localhost.
 */

import pg from 'pg';
import { neon, Pool as NeonPool } from '@neondatabase/serverless';

const { Pool: PgPool } = pg;

// Universal environment variable resolver
export function getConnectionString() {
  const priorityKeys = [
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL',
    'STORAGE_URL',
    'POSTGRES_URL_NON_POOLING',
    'NEON_DATABASE_URL',
    'SUPABASE_DATABASE_URL',
    'SQL_DATABASE_URL'
  ];

  for (const key of priorityKeys) {
    if (process.env[key] && typeof process.env[key] === 'string' && process.env[key].trim()) {
      return process.env[key].trim();
    }
  }

  // Dynamic scan: ANY environment variable containing postgres:// or postgresql://
  for (const [key, val] of Object.entries(process.env)) {
    if (typeof val === 'string' && (val.startsWith('postgres://') || val.startsWith('postgresql://'))) {
      return val.trim();
    }
  }

  // Component fallback: POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD
  const host = process.env.POSTGRES_HOST || process.env.STORAGE_HOST || process.env.DB_HOST;
  const user = process.env.POSTGRES_USER || process.env.STORAGE_USER || process.env.DB_USER;
  const password = process.env.POSTGRES_PASSWORD || process.env.STORAGE_PASSWORD || process.env.DB_PASSWORD;
  const database = process.env.POSTGRES_DATABASE || process.env.STORAGE_DATABASE || process.env.DB_NAME || 'neondb';

  if (host && user && password) {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
  }

  return null;
}

export function isSqlConfigured() {
  return Boolean(getConnectionString());
}

export function getSqlProviderName() {
  const conn = getConnectionString();
  if (!conn) return 'Not Connected';
  if (conn.includes('neon.tech')) return 'Neon PostgreSQL (Serverless)';
  if (conn.includes('supabase.co')) return 'Supabase PostgreSQL';
  if (conn.includes('vercel-storage.com')) return 'Vercel Postgres';
  return 'PostgreSQL';
}

let globalPool = null;
let isSchemaReady = false;

function getPool() {
  const connectionString = getConnectionString();
  if (!connectionString) return null;

  if (!globalPool) {
    if (connectionString.includes('neon.tech')) {
      globalPool = new NeonPool({
        connectionString,
        max: 6,
        idleTimeoutMillis: 20000,
        connectionTimeoutMillis: 7000
      });
    } else {
      globalPool = new PgPool({
        connectionString,
        ssl: {
          rejectUnauthorized: false
        },
        max: 6,
        idleTimeoutMillis: 20000,
        connectionTimeoutMillis: 7000
      });
    }

    globalPool.on('error', (err) => {
      console.error('[SQL Pool Error]', err);
    });
  }

  return globalPool;
}

/**
 * Execute query using Neon HTTP driver if Neon URL, or pooled client
 */
export async function executeQuery(text, params = []) {
  const connStr = getConnectionString();
  if (!connStr) {
    throw new Error('No SQL connection string found in environment variables.');
  }

  // Fast-path: Neon HTTP driver for ultra-low latency serverless fetch
  if (connStr.includes('neon.tech')) {
    try {
      const sql = neon(connStr, { fullResults: true });
      const res = await sql.query(text, params);
      const rows = res.rows || (Array.isArray(res) ? res : [res]);
      return { rows };
    } catch (neonErr) {
      console.warn('[Neon HTTP Driver warning, falling back to Pool]:', neonErr.message);
    }
  }

  // Universal PostgreSQL Pool
  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

/**
 * Auto-migration: Ensures tables exist and initial record is seeded
 */
export async function ensureSchema(defaultConfig = null) {
  if (isSchemaReady) return;

  const createTable1 = `
    CREATE TABLE IF NOT EXISTS site_config (
      id VARCHAR(64) PRIMARY KEY,
      config_data JSONB NOT NULL,
      admin_password VARCHAR(255) NOT NULL DEFAULT '1234',
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createTable2 = `
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(100) NOT NULL,
      details JSONB,
      ip_address VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await executeQuery(createTable1);
  await executeQuery(createTable2);

  // Check if active config exists
  const checkRes = await executeQuery(
    `SELECT id FROM site_config WHERE id = 'active' LIMIT 1;`
  );

  if (!checkRes.rows || checkRes.rows.length === 0) {
    const initialConfig = defaultConfig || {
      siteTitle: "Trikstr Network",
      bioText: "Animator | Motion Designer | 3D Artist",
      adminPassword: "1234",
      avatarRadius: "50%",
      avatarType: "circle",
      buttons: []
    };

    const initialPassword = initialConfig.adminPassword || '1234';

    await executeQuery(
      `INSERT INTO site_config (id, config_data, admin_password, updated_at)
       VALUES ('active', $1, $2, NOW())
       ON CONFLICT (id) DO NOTHING;`,
      [JSON.stringify(initialConfig), initialPassword]
    );

    await executeQuery(
      `INSERT INTO admin_audit_logs (action, details, ip_address)
       VALUES ('DB_INITIALIZED', $1, 'system');`,
      [JSON.stringify({ seeded: true, timestamp: new Date().toISOString() })]
    );
  }

  isSchemaReady = true;
}

/**
 * Fetch config from PostgreSQL
 */
export async function fetchSqlConfig(defaultConfig = null) {
  await ensureSchema(defaultConfig);

  const res = await executeQuery(
    `SELECT config_data, admin_password, updated_at FROM site_config WHERE id = 'active' LIMIT 1;`
  );

  if (res.rows && res.rows.length > 0) {
    const row = res.rows[0];
    const data = typeof row.config_data === 'string' ? JSON.parse(row.config_data) : row.config_data;
    data.adminPassword = row.admin_password;
    data._lastSyncedAt = row.updated_at;
    data._storageProvider = getSqlProviderName();
    return data;
  }

  return null;
}

/**
 * Save config to PostgreSQL atomically with audit log
 */
export async function saveSqlConfig(configPayload, newPassword, clientIp = 'unknown', userAgent = '') {
  await ensureSchema(configPayload);

  const cleanConfig = Object.assign({}, configPayload);
  delete cleanConfig.adminPassword; // Password stored in dedicated column

  const passToSave = newPassword || configPayload.adminPassword || '1234';

  const upsertQuery = `
    INSERT INTO site_config (id, config_data, admin_password, updated_at)
    VALUES ('active', $1, $2, NOW())
    ON CONFLICT (id) DO UPDATE SET
      config_data = EXCLUDED.config_data,
      admin_password = EXCLUDED.admin_password,
      updated_at = NOW()
    RETURNING updated_at;
  `;

  const res = await executeQuery(upsertQuery, [
    JSON.stringify(cleanConfig),
    passToSave
  ]);

  const updatedAt = res.rows && res.rows[0] ? res.rows[0].updated_at : new Date().toISOString();

  // Insert audit log
  await executeQuery(
    `INSERT INTO admin_audit_logs (action, details, ip_address)
     VALUES ('CONFIG_UPDATED', $1, $2);`,
    [
      JSON.stringify({
        title: cleanConfig.siteTitle || 'Trikstr Network',
        buttonCount: Array.isArray(cleanConfig.buttons) ? cleanConfig.buttons.length : 0,
        userAgent: userAgent.slice(0, 150)
      }),
      clientIp
    ]
  );

  return {
    success: true,
    updatedAt,
    provider: getSqlProviderName()
  };
}

/**
 * Fetch recent audit logs for Admin Dashboard
 */
export async function fetchRecentLogs(limit = 5) {
  try {
    const res = await executeQuery(
      `SELECT id, action, details, ip_address, created_at
       FROM admin_audit_logs
       ORDER BY id DESC
       LIMIT $1;`,
      [limit]
    );
    return res.rows || [];
  } catch (err) {
    return [];
  }
}
