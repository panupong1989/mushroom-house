import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '../../..', 'db', 'migrations');
const seed = join(here, '../../..', 'db', 'seed.sql');

async function run() {
  const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    console.log('migrate', f);
    await pool.query(readFileSync(join(migDir, f), 'utf8'));
  }
  console.log('seed');
  await pool.query(readFileSync(seed, 'utf8'));
  await pool.end();
  console.log('done');
}
run().catch(e => { console.error(e); process.exit(1); });
