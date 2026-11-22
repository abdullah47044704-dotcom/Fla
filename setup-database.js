/**
 * setup-database.js — Execute schema.sql against connected database
 * Usage:
 *   node setup-database.js
 */

import fs from 'fs';
import path from 'path';
import { getConnectionString, isSqlConfigured, executeQuery, getSqlProviderName } from './api/db.js';

async function setup() {
  console.log('==============================================');
  console.log('   Trikstr Portfolio — SQL Database Setup');
  console.log('==============================================\n');

  const schemaPath = path.join(process.cwd(), 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('❌ Error: schema.sql file not found in root directory.');
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(schemaPath, 'utf8');

  if (!isSqlConfigured()) {
    console.log('⚠️  Notice: No active cloud database connection string detected in environment.');
    console.log('ℹ️  Your raw SQL schema is ready in: schema.sql');
    console.log('\nYou can copy-paste schema.sql into:');
    console.log('  1. Neon Database SQL Editor (https://console.neon.tech)');
    console.log('  2. Supabase SQL Editor');
    console.log('  3. Any PostgreSQL GUI (pgAdmin, DBeaver)');
    console.log('\nOr set your connection string and re-run:');
    console.log('  $env:DATABASE_URL="postgresql://user:pass@ep-host.neon.tech/neondb?sslmode=require"');
    console.log('  node setup-database.js');
    return;
  }

  console.log(`Connecting to: ${getSqlProviderName()}...`);

  try {
    // Split and execute statements
    await executeQuery(sqlContent);
    console.log('✅ SUCCESS! All tables, columns, and initial records created in database:');
    console.log('   - Table: site_config (Profile, bio, theme, styles)');
    console.log('   - Table: site_links (All 8 social buttons)');
    console.log('   - Table: admin_audit_logs (Security and admin activity)');
    console.log('\n🎉 Your SQL Database is fully active and ready!');
  } catch (err) {
    console.error('❌ Error applying schema.sql:', err.message);
  }
}

setup();
