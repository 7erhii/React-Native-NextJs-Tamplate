/**
 * Loads the repo-root `.env` into process.env.
 *
 * Expo and Next otherwise look next to their own app folders. One file at the
 * monorepo root is the contract. Missing file is fine (case A needs no secrets).
 *
 * EXPO_PUBLIC_* and NEXT_PUBLIC_* for the same Supabase project alias each other
 * so the template only has to list one pair.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const envFile = path.join(repoRoot, '.env');

if (fs.existsSync(envFile)) {
  require('dotenv').config({ path: envFile, override: false });
}

function alias(from, to) {
  const value = process.env[from];
  if (value && !process.env[to]) {
    process.env[to] = value;
  }
}

alias('EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
alias('NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
alias('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
alias('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
