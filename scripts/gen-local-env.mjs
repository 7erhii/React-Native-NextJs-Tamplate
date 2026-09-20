#!/usr/bin/env node
/**
 * Fills infra/supabase/.env and the repo-root .env for local Docker.
 *
 * Existing real values are kept. Placeholders (YOUR_*, tutorial defaults) are
 * replaced. The service-role key stays in infra/supabase/.env only.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_EXAMPLE = join(ROOT, 'infra/supabase/.env.example');
const SUPABASE_ENV = join(ROOT, 'infra/supabase/.env');
const APP_EXAMPLE = join(ROOT, '.env.example');
const APP_ENV = join(ROOT, '.env');

function hex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signJwt(payload, secret) {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson(payload);
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1));
  }
  return map;
}

function isPlaceholder(value) {
  if (!value) return true;
  if (/^YOUR_[A-Z0-9_]+$/.test(value)) return true;
  if (/^your-/i.test(value)) return true;
  if (value === 'this_password_is_insecure_and_should_be_updated') return true;
  if (value === 'GOOGLE_PROJECT_ID' || value === 'GOOGLE_PROJECT_NUMBER') return false;
  return false;
}

function upsert(map, key, value, { overwritePlaceholder = true } = {}) {
  const current = map.get(key);
  if (current === undefined) {
    map.set(key, value);
    return;
  }
  if (overwritePlaceholder && isPlaceholder(current)) {
    map.set(key, value);
  }
}

function serialize(baseText, map) {
  const seen = new Set();
  const lines = baseText.split(/\r?\n/).map((line) => {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) return line;
    const eq = line.indexOf('=');
    const key = line.slice(0, eq).trim();
    if (!map.has(key)) return line;
    seen.add(key);
    return `${key}=${map.get(key)}`;
  });
  const extras = [];
  for (const [key, value] of map) {
    if (!seen.has(key)) extras.push(`${key}=${value}`);
  }
  if (extras.length === 0) return `${lines.join('\n')}\n`.replace(/\n+$/, '\n');
  return `${lines.join('\n').replace(/\n+$/, '')}\n\n# ---- Added for the pinned upstream stack ----\n${extras.join('\n')}\n`;
}

if (!existsSync(SUPABASE_ENV)) {
  copyFileSync(SUPABASE_EXAMPLE, SUPABASE_ENV);
}

const supabaseText = readFileSync(SUPABASE_ENV, 'utf8');
const supabase = parseEnv(supabaseText);

const jwtSecret = isPlaceholder(supabase.get('JWT_SECRET')) ? hex(32) : supabase.get('JWT_SECRET');
const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 60 * 60;
const claims = { iss: 'supabase-demo', iat: now, exp };

const anonKey = isPlaceholder(supabase.get('ANON_KEY'))
  ? signJwt({ role: 'anon', ...claims }, jwtSecret)
  : supabase.get('ANON_KEY');
const serviceKey = isPlaceholder(supabase.get('SERVICE_ROLE_KEY'))
  ? signJwt({ role: 'service_role', ...claims }, jwtSecret)
  : supabase.get('SERVICE_ROLE_KEY');

const postgresPassword = isPlaceholder(supabase.get('POSTGRES_PASSWORD'))
  ? hex(24)
  : supabase.get('POSTGRES_PASSWORD');
const dashboardPassword = isPlaceholder(supabase.get('DASHBOARD_PASSWORD'))
  ? hex(12)
  : supabase.get('DASHBOARD_PASSWORD');
const secretKeyBase = isPlaceholder(supabase.get('SECRET_KEY_BASE'))
  ? hex(32)
  : supabase.get('SECRET_KEY_BASE');
const vaultEncKey = isPlaceholder(supabase.get('VAULT_ENC_KEY'))
  ? hex(16)
  : supabase.get('VAULT_ENC_KEY');
const logflarePublic = isPlaceholder(supabase.get('LOGFLARE_PUBLIC_ACCESS_TOKEN'))
  ? hex(24)
  : supabase.get('LOGFLARE_PUBLIC_ACCESS_TOKEN');
const logflarePrivate = isPlaceholder(supabase.get('LOGFLARE_PRIVATE_ACCESS_TOKEN'))
  ? hex(24)
  : supabase.get('LOGFLARE_PRIVATE_ACCESS_TOKEN');
const logflareApi = isPlaceholder(supabase.get('LOGFLARE_API_KEY'))
  ? logflarePublic
  : supabase.get('LOGFLARE_API_KEY');

upsert(supabase, 'POSTGRES_PASSWORD', postgresPassword);
upsert(supabase, 'JWT_SECRET', jwtSecret);
upsert(supabase, 'ANON_KEY', anonKey);
upsert(supabase, 'SERVICE_ROLE_KEY', serviceKey);
upsert(supabase, 'DASHBOARD_PASSWORD', dashboardPassword);
upsert(supabase, 'SECRET_KEY_BASE', secretKeyBase);
upsert(supabase, 'VAULT_ENC_KEY', vaultEncKey);
upsert(supabase, 'LOGFLARE_PUBLIC_ACCESS_TOKEN', logflarePublic);
upsert(supabase, 'LOGFLARE_PRIVATE_ACCESS_TOKEN', logflarePrivate);
upsert(supabase, 'LOGFLARE_API_KEY', logflareApi);
upsert(supabase, 'LOGFLARE_LOGGER_BACKEND_API_KEY', logflareApi);
upsert(supabase, 'MAILER_URLPATHS_CONFIRMATION', '/auth/v1/verify');
upsert(supabase, 'MAILER_URLPATHS_INVITE', '/auth/v1/verify');
upsert(supabase, 'MAILER_URLPATHS_RECOVERY', '/auth/v1/verify');
upsert(supabase, 'MAILER_URLPATHS_EMAIL_CHANGE', '/auth/v1/verify');
upsert(supabase, 'GOOGLE_PROJECT_ID', 'GOOGLE_PROJECT_ID');
upsert(supabase, 'GOOGLE_PROJECT_NUMBER', 'GOOGLE_PROJECT_NUMBER');
upsert(supabase, 'POOLER_TENANT_ID', 'mobile-world');

const redirects = supabase.get('ADDITIONAL_REDIRECT_URLS') ?? '';
if (!redirects.includes('http://localhost:3000')) {
  const next = redirects
    ? `${redirects.replace(/,$/, '')},http://localhost:3000`
    : 'http://localhost:3000';
  supabase.set('ADDITIONAL_REDIRECT_URLS', next);
}

writeFileSync(SUPABASE_ENV, serialize(supabaseText, supabase));

if (!existsSync(APP_ENV)) {
  copyFileSync(APP_EXAMPLE, APP_ENV);
}
const appText = readFileSync(APP_ENV, 'utf8');
const app = parseEnv(appText);
upsert(app, 'EXPO_PUBLIC_SUPABASE_URL', supabase.get('API_EXTERNAL_URL') || 'http://localhost:54321');
upsert(app, 'EXPO_PUBLIC_SUPABASE_ANON_KEY', anonKey);
upsert(app, 'NEXT_PUBLIC_SUPABASE_URL', supabase.get('API_EXTERNAL_URL') || 'http://localhost:54321');
upsert(app, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', anonKey);
writeFileSync(APP_ENV, serialize(appText, app));

console.log('Local env ready:');
console.log(`  ${SUPABASE_ENV}`);
console.log(`  ${APP_ENV}`);
console.log(`  Studio user: ${supabase.get('DASHBOARD_USERNAME')}`);
console.log('  Studio password: (see DASHBOARD_PASSWORD in infra/supabase/.env)');
