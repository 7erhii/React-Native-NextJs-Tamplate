#!/usr/bin/env node
/**
 * Fails when a secret appears somewhere it must not.
 *
 * Two distinct mistakes are caught:
 *
 *   1. A real `.env` file staged for commit. Template files are fine; the filled
 *      ones are not.
 *   2. A privileged Supabase key, or any credential-shaped literal, in tracked
 *      source. The service-role key bypasses row-level security completely, so
 *      one leak of it defeats every policy in the schema at once.
 *
 * Deliberately noisy rather than clever: a false positive costs a moment, a false
 * negative costs a rotated credential and an audit.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  '.next',
  '.turbo',
  'dist',
  'coverage',
  'docker', // fetched upstream stack, not ours
]);

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.sql', '.yml', '.yaml', '.sh',
]);

/** Files whose whole purpose is to describe secrets without containing any. */
const TEMPLATE_FILES = new Set(['.env.example', 'check-secrets.mjs', 'gen-local-env.mjs']);

const PATTERNS = [
  {
    name: 'Supabase service-role key',
    // A JWT whose payload declares the service_role. Matches the base64 of
    // {"role":"service_role" regardless of surrounding whitespace variants.
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*(c2VydmljZV9yb2xl|InNlcnZpY2Vfcm9sZSI)/,
    detail: 'The service-role key bypasses RLS entirely and must never be committed or bundled.',
  },
  {
    name: 'service_role literal in an EXPO_PUBLIC_ variable',
    regex: /EXPO_PUBLIC_[A-Z_]*\s*=\s*.*service_role/i,
    detail: 'EXPO_PUBLIC_ variables are compiled into the shipped app bundle.',
  },
  {
    name: 'Google OAuth client secret',
    regex: /GOCSPX-[A-Za-z0-9_-]{10,}/,
    detail: 'The OAuth client secret belongs only in infra/supabase/.env.',
  },
  {
    name: 'Private key block',
    regex: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
    detail: 'Private keys must never be committed.',
  },
  {
    name: 'Assigned secret-looking literal',
    // Long opaque value assigned to an obviously sensitive name. Placeholders in
    // ALL_CAPS (YOUR_..._KEY) are excluded so templates stay clean.
    regex:
      /(?:password|secret|api[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*['"](?![A-Z_]{6,}['"])[^'"\s]{16,}['"]/i,
    detail: 'Move the value to an environment variable and commit only a placeholder.',
  },
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
    } else {
      yield join(dir, entry.name);
    }
  }
}

function extensionOf(path) {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(index);
}

async function checkEnvFiles() {
  const problems = [];
  for (const candidate of ['.env', 'infra/supabase/.env']) {
    try {
      await stat(join(ROOT, candidate));
      // Present on disk is expected and fine; it must simply be gitignored.
      const gitignore = await readFile(join(ROOT, '.gitignore'), 'utf8');
      if (!/^\.env$/m.test(gitignore)) {
        problems.push(`${candidate} exists but .gitignore does not ignore .env`);
      }
    } catch {
      /* absent, which is fine */
    }
  }
  return problems;
}

async function main() {
  const findings = [];
  let scanned = 0;

  for await (const path of walk(ROOT)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (TEMPLATE_FILES.has(name)) continue;
    if (name === '.env' || name.startsWith('.env.')) continue; // gitignored, checked separately
    if (!SCAN_EXTENSIONS.has(extensionOf(path))) continue;

    scanned += 1;
    const content = await readFile(path, 'utf8');

    for (const pattern of PATTERNS) {
      if (pattern.regex.test(content)) {
        findings.push({ file: relative(ROOT, path), pattern });
      }
    }
  }

  const envProblems = await checkEnvFiles();

  console.log(`Scanned ${scanned} file(s).`);

  if (findings.length === 0 && envProblems.length === 0) {
    console.log('✓ No committed secrets detected.');
    return;
  }

  console.error('\n✗ Possible secrets detected:\n');
  for (const { file, pattern } of findings) {
    console.error(`    ${file}`);
    console.error(`      ${pattern.name} — ${pattern.detail}\n`);
  }
  for (const problem of envProblems) {
    console.error(`    ${problem}\n`);
  }
  console.error(
    'If a real credential was committed, rotate it. Removing the commit is not\n' +
      'enough: it remains in the history and in every clone.\n',
  );
  process.exit(1);
}

await main();
