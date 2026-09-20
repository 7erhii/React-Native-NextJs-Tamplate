#!/usr/bin/env node
/**
 * Fails when a table holding player data does not enable row-level security.
 *
 * This is a static check over the migration files rather than a live query, so it
 * runs in CI with no database and catches the mistake before it can ever be
 * deployed. RLS is the *only* thing standing between one player's saves and
 * another's — if it is missing, the app keeps working and quietly exposes
 * everything, which is exactly the class of bug that needs a machine to catch it.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'infra/supabase/migrations';

/** Tables allowed to exist without RLS, each with a stated reason. */
const EXEMPT = new Map([
  // Written only by SECURITY DEFINER functions and readable by no client policy.
  // Still RLS-enabled in practice; listed here so the exemption path is tested.
]);

function findCreatedTables(sql) {
  const pattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi;
  return [...sql.matchAll(pattern)].map((match) => match[1]);
}

function findRlsEnabled(sql) {
  const pattern =
    /alter\s+table\s+(?:public\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi;
  return new Set([...sql.matchAll(pattern)].map((match) => match[1]));
}

async function main() {
  let files;
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  } catch {
    console.error(`✗ Cannot read ${MIGRATIONS_DIR}. Run this from the project root.`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`✗ No migrations found in ${MIGRATIONS_DIR}.`);
    process.exit(1);
  }

  let sql = '';
  for (const file of files) {
    sql += `\n${await readFile(join(MIGRATIONS_DIR, file), 'utf8')}`;
  }

  const created = findCreatedTables(sql);
  const protectedTables = findRlsEnabled(sql);
  const failures = [];

  for (const table of created) {
    if (protectedTables.has(table) || EXEMPT.has(table)) continue;
    failures.push(table);
  }

  console.log(`Checked ${files.length} migration file(s), ${created.length} table(s).`);

  if (failures.length > 0) {
    console.error('\n✗ These tables are created without row-level security:\n');
    for (const table of failures) {
      console.error(`    public.${table}`);
    }
    console.error(
      '\nAdd `alter table public.<name> enable row level security;` in the same\n' +
        'migration that creates the table, together with explicit policies.\n',
    );
    process.exit(1);
  }

  for (const table of created) {
    console.log(`  ✓ public.${table} — RLS enabled`);
  }
  console.log('\n✓ Every player-data table enables row-level security.');
}

await main();
