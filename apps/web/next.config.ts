import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

const configDir = dirname(fileURLToPath(import.meta.url));

const envCandidates = [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')];
const envFile = envCandidates.find((file) => existsSync(file));
if (envFile) {
  loadEnv({ path: envFile, override: false });
}

function alias(from: string, to: string) {
  const value = process.env[from];
  if (value && !process.env[to]) process.env[to] = value;
}

alias('EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
alias('NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
alias('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
alias('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

const nextConfig: NextConfig = {
  transpilePackages: ['@world/config', '@world/tokens'],
  ...(process.env.OUTPUT_STANDALONE === '1'
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: resolve(configDir, '../..'),
      }
    : {}),
};

export default nextConfig;
