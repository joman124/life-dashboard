/**
 * lib/db/client.ts — libSQL (@libsql/client) singleton + schema init.
 *
 * libSQL is SQLite-compatible but its driver is Promise-based, so every helper
 * in this directory is async. In development (and any environment without
 * TURSO_DATABASE_URL) it opens a local `file:` database under data/; in
 * production it connects to a remote Turso database selected by env var — which
 * is what lets this app run on Vercel's read-only serverless filesystem.
 *
 * The client is cached on globalThis so it survives Next.js dev-server hot
 * reloads AND is reused across warm serverless invocations. Schema creation +
 * first-run seed run exactly once per process via a promise cached on globalThis
 * (ensureReady): concurrent route handlers awaiting it share the one in-flight
 * promise, so parallel cold-start requests never double-seed.
 */
import { createClient, type Client } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { seed, DEFAULT_METRICS, ADDED_METRIC_IDS } from '@/lib/seed';

export type DB = Client;

/**
 * libSQL rows are objects keyed by column name, but values are typed loosely
 * (string | number | bigint | null | …). Each table module narrows its own rows
 * from this shape, forcing numeric columns through Number(...) so a bigint from
 * an INTEGER column never leaks into JSON (JSON.stringify throws on bigint).
 */
export type RawRow = Record<string, unknown>;

/* ---------------------------------------------------------------- schema */

// Run as individual statements (libSQL batch executes one statement per entry).
const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS metrics (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    emoji         TEXT NOT NULL,
    unit          TEXT NOT NULL,
    goal          REAL NOT NULL,
    goalDirection TEXT NOT NULL,
    step          REAL NOT NULL,
    "max"         REAL NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    category      TEXT NOT NULL DEFAULT 'CUSTOM',
    description   TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    metricId TEXT NOT NULL REFERENCES metrics(id),
    date     TEXT NOT NULL,
    value    REAL NOT NULL,
    UNIQUE (metricId, date)
  )`,
  `CREATE TABLE IF NOT EXISTS timeline (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    date   TEXT NOT NULL,
    time   TEXT NOT NULL,
    title  TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    source TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`,
  // Connector OAuth tokens. provider is the PK (one row per connector), so the
  // table is extensible: future wearables (Oura, Whoop, Fitbit) reuse it by
  // inserting their own provider row. data holds the serialized token JSON
  // (plaintext, or AES-256-GCM ciphertext when TOKEN_ENCRYPTION_KEY is set).
  `CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider   TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    email      TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_entries_date  ON entries(date)`,
  `CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline(date)`,
];

/* --------------------------------------------------------------- migrations */

/**
 * One-time migrations for databases created before a feature existed.
 *
 * Each migration is guarded by a marker row in sync_state, and the marker is
 * written whether or not the migration changed anything. That "run once, ever"
 * property is the point: a plain `INSERT OR IGNORE` on every boot would
 * resurrect a metric the user had deliberately deleted in the Track tab, which
 * is worse than never adding it. Markers are never removed, so a migration
 * cannot re-run and undo a later user decision.
 */
async function runMigrations(client: Client): Promise<void> {
  // One marker per added metric, so introducing a new one later is not blocked
  // by the marker an earlier migration already wrote.
  for (const metricId of ADDED_METRIC_IDS) {
    const marker = `migration_metric_${metricId}_v1`;

    const seen = await client.execute({
      sql: 'SELECT value FROM sync_state WHERE key = ?',
      args: [marker],
    });
    if (seen.rows.length > 0) continue;

    // These metrics postdate the original seed: Mood receives Apple Journal's
    // State of Mind, Screen Time receives the number the Shortcut prompts for.
    // Without the row, an import has nowhere to land and is reported as ignored.
    const m = DEFAULT_METRICS.find((d) => d.id === metricId);
    if (m) {
      await client.execute({
        sql: `INSERT INTO metrics (id, name, emoji, unit, goal, goalDirection, step, "max", active, category, description)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO NOTHING`,
        args: [
          m.id,
          m.name,
          m.emoji,
          m.unit,
          m.goal,
          m.goalDirection,
          m.step,
          m.max,
          m.active,
          m.category,
          m.description,
        ],
      });
    }

    await client.execute({
      sql: `INSERT INTO sync_state (key, value) VALUES (?, ?)
            ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      args: [marker, new Date().toISOString()],
    });
  }
}

/* ------------------------------------------------------------- singleton */

const globalForDb = globalThis as unknown as {
  __lifeDashboardClient?: Client;
  __lifeDashboardReady?: Promise<void>;
};

/**
 * Build (once) and return the bare libSQL client WITHOUT waiting for schema/seed.
 * Used internally by ensureReady so it can run the schema; public callers should
 * use getClient(), which also awaits readiness.
 */
function rawClient(): Client {
  if (globalForDb.__lifeDashboardClient) return globalForDb.__lifeDashboardClient;

  // Remote Turso (production) when TURSO_DATABASE_URL is set; otherwise a local
  // file under data/. Only the local-file path needs the directory created —
  // a remote URL must never trigger a filesystem write (Vercel is read-only).
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  let url: string;
  if (remoteUrl) {
    url = remoteUrl;
  } else {
    // Serverless filesystems are read-only, so the mkdir below would fail with
    // a bare `ENOENT: mkdir '/var/task/data'` on every route — an error that
    // says nothing about the actual cause. Name it instead.
    if (process.env.VERCEL) {
      throw new Error(
        'TURSO_DATABASE_URL is not set. Serverless has no writable filesystem, ' +
          'so the local file database cannot be used here — connect a Turso ' +
          'database (Vercel → Storage → Turso) and redeploy.',
      );
    }
    const dataDir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    url = 'file:' + path.join(dataDir, 'life-dashboard.db');
  }

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  globalForDb.__lifeDashboardClient = client;
  return client;
}

/**
 * Idempotently create the schema and seed on first run. The returned promise is
 * cached on globalThis so every helper awaits the SAME promise — schema + seed
 * run exactly once per process even under concurrent first-hit requests.
 */
function ensureReady(): Promise<void> {
  if (globalForDb.__lifeDashboardReady) return globalForDb.__lifeDashboardReady;

  const ready = (async () => {
    const client = rawClient();
    await client.batch(SCHEMA_STATEMENTS, 'write');

    const res = await client.execute('SELECT COUNT(*) AS n FROM metrics');
    const n = Number(res.rows[0]?.n ?? 0);
    if (n === 0) await seed(client);

    // After seeding, so a fresh database records the markers as already applied
    // rather than re-inserting what seed() just wrote.
    await runMigrations(client);
  })();

  // Cache the in-flight promise immediately so parallel callers share it. If it
  // rejects, clear the cache so a later call can retry rather than being stuck
  // with a permanently-rejected promise.
  globalForDb.__lifeDashboardReady = ready;
  ready.catch(() => {
    globalForDb.__lifeDashboardReady = undefined;
  });
  return ready;
}

/** Public accessor: the ready-to-use client (schema created, seed applied). */
export async function getClient(): Promise<Client> {
  await ensureReady();
  return rawClient();
}
