/**
 * /api/config.js — Vercel Serverless Function
 * Priority Hierarchy:
 * 1. Advanced PostgreSQL (Neon / Supabase / Vercel Postgres) via api/db.js
 * 2. Vercel Blob (BLOB_READ_WRITE_TOKEN)
 * 3. Upstash Redis / Vercel KV (KV_REST_API_URL / UPSTASH_REDIS_REST_URL)
 * 4. Local fallback config
 */

import fs from 'fs';
import path from 'path';
import {
  isSqlConfigured,
  getSqlProviderName,
  fetchSqlConfig,
  saveSqlConfig,
  fetchRecentLogs,
  executeQuery
} from './db.js';

// Load default config as resilient fallback
let cachedDefaultConfig = null;
function getDefaultConfig() {
  if (cachedDefaultConfig) return cachedDefaultConfig;
  try {
    const configPath = path.join(process.cwd(), 'site-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      cachedDefaultConfig = JSON.parse(raw);
      return cachedDefaultConfig;
    }
  } catch (err) {
    console.warn('Error reading default site-config.json:', err.message);
  }

  // Safe hardcoded baseline if file is unavailable
  return {
    siteTitle: "Trikstr Network",
    metaDescription: "All my social links under one roof.",
    adminPassword: "1234",
    avatarUrl: "assets/images/image01.jpg",
    avatarType: "circle",
    avatarRadius: "50%",
    bioText: "Animator | Motion Designer | 3D Artist",
    backgroundEffect: "matrix",
    buttons: []
  };
}

export default async function handler(req, res) {
  // CORS & Strict Cache-Control
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIp =
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const ENV_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

  const defaultConfig = getDefaultConfig();
  let currentConfig = null;
  let activeProvider = 'Local File';

  // 1. Check SQL Database (Highest priority)
  if (isSqlConfigured()) {
    try {
      currentConfig = await fetchSqlConfig(defaultConfig);
      if (currentConfig) {
        activeProvider = getSqlProviderName();
      }
    } catch (sqlErr) {
      console.error('[SQL Read Error]:', sqlErr.message);
    }
  }

  // 2. Fallback to Upstash Redis / Vercel KV if SQL not active
  if (!currentConfig && KV_URL && KV_TOKEN) {
    try {
      const response = await fetch(`${KV_URL}/get/trikstr_config`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        cache: 'no-store'
      });
      const data = await response.json();
      if (data && data.result) {
        currentConfig = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
        activeProvider = 'Upstash Redis';
      }
    } catch (err) {
      console.error('[KV Read Error]:', err.message);
    }
  }

  // 3. Fallback to Vercel Blob
  if (!currentConfig && BLOB_TOKEN) {
    try {
      const listRes = await fetch('https://blob.vercel-storage.com?prefix=trikstr-config.json', {
        headers: { Authorization: `Bearer ${BLOB_TOKEN}` },
        cache: 'no-store'
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.blobs && listData.blobs.length > 0) {
          const blobUrl = listData.blobs[0].url;
          const blobContentRes = await fetch(blobUrl, { cache: 'no-store' });
          if (blobContentRes.ok) {
            currentConfig = await blobContentRes.json();
            activeProvider = 'Vercel Blob';
          }
        }
      }
    } catch (blobErr) {
      console.error('[Blob Read Error]:', blobErr.message);
    }
  }

  // 4. Default fallback if nothing exists yet
  if (!currentConfig) {
    currentConfig = Object.assign({}, defaultConfig);
  }

  const expectedPassword = currentConfig.adminPassword || ENV_PASSWORD || '1234';

  // GET: Health / Status Check endpoint
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const actionParam = urlObj.searchParams.get('action');

  if (req.method === 'GET' && actionParam === 'status') {
    let recentLogs = [];
    let sqlHealth = 'Disconnected';

    if (isSqlConfigured()) {
      try {
        const pingRes = await executeQuery('SELECT NOW() as current_time, count(*) as config_rows FROM site_config;');
        sqlHealth = 'Connected & Healthy';
        recentLogs = await fetchRecentLogs(5);
      } catch (err) {
        sqlHealth = 'Connection Error: ' + err.message;
      }
    }

    return res.status(200).json({
      status: 'ok',
      activeProvider,
      sql: {
        configured: isSqlConfigured(),
        provider: getSqlProviderName(),
        health: sqlHealth
      },
      blob: {
        configured: Boolean(BLOB_TOKEN)
      },
      redis: {
        configured: Boolean(KV_URL && KV_TOKEN)
      },
      recentLogs
    });
  }

  // GET: Retrieve configuration for site & admin preview
  if (req.method === 'GET') {
    const safeConfig = Object.assign({}, currentConfig);
    delete safeConfig.adminPassword; // Never expose password publicly
    safeConfig._storageProvider = activeProvider;
    safeConfig._isSqlConnected = isSqlConfigured();

    return res.status(200).json(safeConfig);
  }

  // POST: Save configuration
  if (req.method === 'POST') {
    const clientPassword = req.headers['x-admin-password'] || (req.body && req.body.adminPassword);

    if (clientPassword !== expectedPassword) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid Admin Password'
      });
    }

    const payload = req.body && req.body.config ? req.body.config : req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid config payload' });
    }

    const newPassword = (req.body && req.body.newPassword) || payload.adminPassword || expectedPassword;
    payload.adminPassword = newPassword;

    let savedTargets = [];

    // 1. Save to SQL Database
    if (isSqlConfigured()) {
      try {
        const sqlResult = await saveSqlConfig(payload, newPassword, clientIp, userAgent);
        savedTargets.push(sqlResult.provider);
      } catch (sqlErr) {
        console.error('[SQL Write Error]:', sqlErr);
      }
    }

    // 2. Save to Upstash Redis / Vercel KV if configured
    if (KV_URL && KV_TOKEN) {
      try {
        const strData = JSON.stringify(payload);
        await fetch(`${KV_URL}/set/trikstr_config`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${KV_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(strData)
        });
        savedTargets.push('Upstash Redis');
      } catch (err) {
        console.error('[KV Write Error]:', err.message);
      }
    }

    // 3. Save to Vercel Blob if configured
    if (BLOB_TOKEN) {
      try {
        const strData = JSON.stringify(payload);
        const putRes = await fetch('https://blob.vercel-storage.com/trikstr-config.json', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${BLOB_TOKEN}`,
            'x-add-random-suffix': '0',
            'x-content-type': 'application/json'
          },
          body: strData
        });
        if (putRes.ok) {
          savedTargets.push('Vercel Blob');
        }
      } catch (blobPutErr) {
        console.error('[Blob Read Error]:', blobPutErr.message);
      }
    }

    if (savedTargets.length > 0) {
      return res.status(200).json({
        success: true,
        message: `Saved to ${savedTargets.join(' + ')}! Your live portfolio is updated worldwide.`
      });
    }

    return res.status(200).json({
      success: true,
      warning: 'Saved locally in browser storage. Connect Neon PostgreSQL or Blob in Vercel Storage to sync worldwide.'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
