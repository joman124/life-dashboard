import fs from 'fs';
import { createClient } from '@libsql/client';

// Load .env.local manually (no dotenv dep in this project).
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const url = process.env.TURSO_DATABASE_URL;
console.log('Connecting to:', url ? url.slice(0, 30) + '...' : '(none)');

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
);
console.log('Tables:', tables.rows.map((r) => r.name).join(', '));

for (const t of ['metrics', 'entries', 'timeline', 'sync_state', 'oauth_tokens']) {
  try {
    const c = await client.execute(`SELECT COUNT(*) AS n FROM ${t}`);
    console.log(`  ${t}: ${Number(c.rows[0].n)} rows`);
  } catch (e) {
    console.log(`  ${t}: (missing) ${e.message}`);
  }
}

const m = await client.execute('SELECT id, name, active FROM metrics ORDER BY id');
console.log('Metrics:', m.rows.map((r) => `${r.name}${Number(r.active) ? '' : '(off)'}`).join(', '));
console.log('OK: local dev is linked to the live Turso database.');
