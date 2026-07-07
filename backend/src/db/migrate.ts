import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '../../..', 'db', 'migrations');
const seed = join(here, '../../..', 'db', 'seed.sql');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename)
    );
    const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (applied.has(f)) { console.log('skip', f, '(already applied)'); continue; }
      console.log('migrate', f);
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(migDir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    console.log('seed');
    await client.query(readFileSync(seed, 'utf8'));
    console.log('done');
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(e => { console.error(e); process.exit(1); });
