/**
 * test-db.js — Quick CLI tool to verify SQL Database connection and tables
 * Usage:
 *   node test-db.js
 * or with custom connection string:
 *   DATABASE_URL="postgres://..." node test-db.js
 */

import {
  isSqlConfigured,
  getSqlProviderName,
  getConnectionString,
  ensureSchema,
  fetchSqlConfig,
  fetchRecentLogs,
  executeQuery
} from './api/db.js';

async function run() {
  console.log('--- SQL Database Diagnostics ---');
  const connStr = getConnectionString();

  if (!isSqlConfigured()) {
    console.log('⚠️  No SQL Database connection string detected.');
    console.log('Set POSTGRES_URL or DATABASE_URL in your environment.');
    console.log('Example: $env:DATABASE_URL="postgresql://user:pass@ep-host.neon.tech/neondb?sslmode=require"');
    return;
  }

  console.log(`✅ Provider Detected: ${getSqlProviderName()}`);
  console.log(`🔗 Target: ${connStr.replace(/:([^:@]{3,})@/, ':***@')}`);

  try {
    console.log('\n[1/3] Testing Ping...');
    const ping = await executeQuery('SELECT NOW() as current_time, version();');
    console.log('✅ Connected successfully!');
    console.log(`   Time: ${ping.rows[0].current_time}`);
    console.log(`   Version: ${ping.rows[0].version.split(' ')[0]} ${ping.rows[0].version.split(' ')[1]}`);

    console.log('\n[2/3] Checking / Auto-Migrating Schema...');
    await ensureSchema();
    console.log('✅ Tables [site_config] and [admin_audit_logs] are verified.');

    console.log('\n[3/3] Fetching Active Site Config...');
    const config = await fetchSqlConfig();
    console.log(`✅ Config retrieved for site: "${config.siteTitle}"`);
    console.log(`   Buttons active: ${Array.isArray(config.buttons) ? config.buttons.length : 0}`);
    console.log(`   Last updated: ${config._lastSyncedAt}`);

    const logs = await fetchRecentLogs(3);
    console.log(`\n📋 Recent Audit Logs (${logs.length}):`);
    logs.forEach(l => {
      console.log(`   - [${l.created_at}] ${l.action} (IP: ${l.ip_address})`);
    });

    console.log('\n🎉 ALL SQL CHECKS PASSED! Database is 100% ready for production.');
  } catch (err) {
    console.error('\n❌ SQL Test Failed:', err);
    process.exit(1);
  }
}

run();
