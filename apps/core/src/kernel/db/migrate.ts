import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
/** Serialises concurrent runners (several app instances starting together). */
const ADVISORY_LOCK_KEY = 72_017_001;

/**
 * Applies `NNN_name.sql` files in lexical order, each in its own transaction, recording them in
 * schema_migrations. Already-applied files are skipped, so the runner is idempotent (M00 §6).
 * Must run as the owner role: migrations create tables, policies and grants.
 */
export async function runMigrations(pool: Pool, dir: string): Promise<string[]> {
  const files = readdirSync(dir).filter((f) => MIGRATION_FILE.test(f)).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    for (const file of files) {
      const name = file.replace(/\.sql$/, '');
      if (done.has(name)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [name]);
        await client.query('commit');
        applied.push(name);
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return applied;
}

export const MIGRATIONS_DIR = resolve(__dirname, '../../../migrations');

/* istanbul ignore next -- CLI entry point: `npm run migrate` */
if (require.main === module) {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
  const pool = new Pool({ connectionString: url });
  runMigrations(pool, MIGRATIONS_DIR)
    .then((names) => process.stdout.write(`Applied ${names.length} migration(s): ${names.join(', ') || 'none'}\n`))
    .finally(() => pool.end());
}
