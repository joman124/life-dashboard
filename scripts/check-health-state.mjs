import fs from 'fs';
import { createClient } from '@libsql/client';
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const s = await c.execute("SELECT key, value FROM sync_state WHERE key LIKE '%health%'");
console.log('health sync_state:', JSON.stringify(s.rows));
const e = await c.execute('SELECT metricId, date, value FROM entries ORDER BY date DESC, metricId LIMIT 12');
console.log('recent entries:', JSON.stringify(e.rows));
console.log('server UTC now:', new Date().toISOString());
