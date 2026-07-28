/**
 * lib/db.ts — libSQL (@libsql/client) singleton + schema init + typed row helpers.
 *
 * libSQL is SQLite-compatible but its driver is Promise-based, so every helper
 * here is async. In development (and any environment without TURSO_DATABASE_URL)
 * it opens a local `file:` database under data/; in production it connects to a
 * remote Turso database selected by env var — which is what lets this app run on
 * Vercel's read-only serverless filesystem.
 *
 * The client is cached on globalThis so it survives Next.js dev-server hot
 * reloads AND is reused across warm serverless invocations. Schema creation +
 * first-run seed run exactly once per process via a promise cached on globalThis
 * (ensureReady): concurrent route handlers awaiting it share the one in-flight
 * promise, so parallel cold-start requests never double-seed.
 *
 * All reads/writes in API routes go through the typed helpers below; they are
 * the single place where SQLite storage shapes (active INTEGER 0/1) are
 * serialized to/from the domain types (active: boolean). libSQL returns INTEGER
 * columns as number|bigint, so numeric fields are defensively coerced with
 * Number(...) to keep them JSON-serializable.
 */
import { createClient, type Client, type InValue } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import type { Entry, Metric, TimelineItem } from '@/lib/types';
import { seed } from '@/lib/seed';

export type DB = Client;

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

/* --------------------------------------------------- row types (storage) */

interface MetricRow {
  id: string;
  name: string;
  emoji: string;
  unit: string;
  goal: number;
  goalDirection: string;
  step: number;
  max: number;
  active: number; // 0 | 1 in SQLite (may arrive as number|bigint)
  category: string;
  description: string | null;
}

interface EntryRow {
  metricId: string;
  date: string;
  value: number;
}

interface TimelineRow {
  id: number;
  date: string;
  time: string;
  title: string;
  detail: string | null;
  source: string | null;
}

/* ------------------------------- storage <-> domain serialization helpers */

// libSQL rows are objects keyed by column name, but values are typed loosely
// (string | number | bigint | null | …). These coercers convert one raw row to
// the strongly-typed storage row, forcing numeric columns through Number(...) so
// a bigint from an INTEGER column never leaks into JSON (JSON.stringify throws on
// bigint). `id` columns stay strings.
type RawRow = Record<string, unknown>;

function toMetricRow(r: RawRow): MetricRow {
  return {
    id: String(r.id),
    name: String(r.name),
    emoji: String(r.emoji),
    unit: String(r.unit),
    goal: Number(r.goal),
    goalDirection: String(r.goalDirection),
    step: Number(r.step),
    max: Number(r.max),
    active: Number(r.active),
    category: String(r.category),
    description: r.description === null || r.description === undefined ? null : String(r.description),
  };
}

function toEntryRow(r: RawRow): EntryRow {
  return {
    metricId: String(r.metricId),
    date: String(r.date),
    value: Number(r.value),
  };
}

function toTimelineRow(r: RawRow): TimelineRow {
  return {
    id: Number(r.id),
    date: String(r.date),
    time: String(r.time),
    title: String(r.title),
    detail: r.detail === null || r.detail === undefined ? null : String(r.detail),
    source: r.source === null || r.source === undefined ? null : String(r.source),
  };
}

function rowToMetric(r: MetricRow): Metric {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    unit: r.unit as Metric['unit'],
    goal: r.goal,
    goalDirection: r.goalDirection as Metric['goalDirection'],
    step: r.step,
    max: r.max,
    active: r.active === 1,
    category: r.category as Metric['category'],
    description: r.description ?? '',
  };
}

function rowToEntry(r: EntryRow): Entry {
  return { metricId: r.metricId, date: r.date, value: r.value };
}

function rowToTimelineItem(r: TimelineRow): TimelineItem {
  return {
    id: r.id,
    date: r.date,
    time: r.time,
    title: r.title,
    detail: r.detail ?? '',
    source: r.source === 'calendar' || r.source === 'manual' ? r.source : null,
  };
}

/* ----------------------------------------------------------------- metrics */

export async function listMetrics(): Promise<Metric[]> {
  const client = await getClient();
  const res = await client.execute('SELECT * FROM metrics ORDER BY rowid');
  return res.rows.map((r) => rowToMetric(toMetricRow(r as RawRow)));
}

export async function getMetricById(id: string): Promise<Metric | null> {
  const client = await getClient();
  const res = await client.execute({ sql: 'SELECT * FROM metrics WHERE id = ?', args: [id] });
  const row = res.rows[0];
  return row ? rowToMetric(toMetricRow(row as RawRow)) : null;
}

export async function createMetric(metric: Metric): Promise<Metric> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO metrics (id, name, emoji, unit, goal, goalDirection, step, "max", active, category, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      metric.id,
      metric.name,
      metric.emoji,
      metric.unit,
      metric.goal,
      metric.goalDirection,
      metric.step,
      metric.max,
      metric.active ? 1 : 0,
      metric.category,
      metric.description,
    ],
  });
  return (await getMetricById(metric.id)) as Metric;
}

export type MetricPatch = Partial<Omit<Metric, 'id'>>;

const METRIC_PATCH_COLUMNS: readonly (keyof Omit<Metric, 'id'>)[] = [
  'name',
  'emoji',
  'unit',
  'goal',
  'goalDirection',
  'step',
  'max',
  'active',
  'category',
  'description',
];

/** Applies a partial update; returns the updated Metric, or null if id is unknown. */
export async function updateMetric(id: string, patch: MetricPatch): Promise<Metric | null> {
  const existing = await getMetricById(id);
  if (!existing) return null;

  const sets: string[] = [];
  const args: InValue[] = [];
  for (const col of METRIC_PATCH_COLUMNS) {
    const value = patch[col];
    if (value === undefined) continue;
    sets.push(`"${col}" = ?`);
    args.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as InValue));
  }
  if (sets.length > 0) {
    const client = await getClient();
    args.push(id); // for the WHERE clause, appended last to match the trailing ?
    await client.execute({ sql: `UPDATE metrics SET ${sets.join(', ')} WHERE id = ?`, args });
  }
  return getMetricById(id);
}

/**
 * Permanently delete a metric and every entry recorded against it.
 * Returns false if the id is unknown.
 *
 * This is a genuine hard delete, distinct from setting active = false (which
 * stops tracking a metric but keeps its history). The entries are removed
 * first, in the same write batch, because entries.metricId is a foreign key
 * into metrics(id) — dropping the metric first would either fail or strand
 * unreachable rows that still count toward exports and correlations.
 */
export async function deleteMetric(id: string): Promise<boolean> {
  const existing = await getMetricById(id);
  if (!existing) return false;

  const client = await getClient();
  await client.batch(
    [
      { sql: 'DELETE FROM entries WHERE metricId = ?', args: [id] },
      { sql: 'DELETE FROM metrics WHERE id = ?', args: [id] },
    ],
    'write'
  );
  return true;
}

/* ----------------------------------------------------------------- entries */

export async function listEntriesBetween(startDate: string, endDate: string): Promise<Entry[]> {
  const client = await getClient();
  const res = await client.execute({
    sql: 'SELECT metricId, date, value FROM entries WHERE date >= ? AND date <= ? ORDER BY date, metricId',
    args: [startDate, endDate],
  });
  return res.rows.map((r) => rowToEntry(toEntryRow(r as RawRow)));
}

export async function listAllEntries(): Promise<Entry[]> {
  const client = await getClient();
  const res = await client.execute('SELECT metricId, date, value FROM entries ORDER BY date, metricId');
  return res.rows.map((r) => rowToEntry(toEntryRow(r as RawRow)));
}

/** Insert or overwrite the value for (metricId, date) — UNIQUE upsert per spec. */
export async function upsertEntry(metricId: string, date: string, value: number): Promise<Entry> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO entries (metricId, date, value) VALUES (?, ?, ?)
          ON CONFLICT (metricId, date) DO UPDATE SET value = excluded.value`,
    args: [metricId, date, value],
  });
  return { metricId, date, value };
}

/* ---------------------------------------------------------------- timeline */

export async function listTimelineForDate(date: string): Promise<TimelineItem[]> {
  const client = await getClient();
  const res = await client.execute({
    sql: 'SELECT id, date, time, title, detail, source FROM timeline WHERE date = ? ORDER BY time, id',
    args: [date],
  });
  return res.rows.map((r) => rowToTimelineItem(toTimelineRow(r as RawRow)));
}

/* -------------------------------------------------------------- sync_state */

export async function getSyncValue(key: string): Promise<string | null> {
  const client = await getClient();
  const res = await client.execute({ sql: 'SELECT value FROM sync_state WHERE key = ?', args: [key] });
  const row = res.rows[0];
  if (!row) return null;
  const v = (row as RawRow).value;
  return v === null || v === undefined ? null : String(v);
}

/** Insert or overwrite a sync_state value (UPSERT on the key PK). */
export async function setSyncValue(key: string, value: string): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO sync_state (key, value) VALUES (?, ?)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}

/** Delete a sync_state row (no-op if the key is absent). */
export async function deleteSyncValue(key: string): Promise<void> {
  const client = await getClient();
  await client.execute({ sql: 'DELETE FROM sync_state WHERE key = ?', args: [key] });
}

/* ------------------------------------------------------------- oauth_tokens */

export interface OAuthTokenRow {
  /** Serialized token JSON — plaintext or AES-256-GCM ciphertext. */
  data: string;
  email: string | null;
  updated_at: string;
}

/** Returns the stored token row for a provider, or null if none. */
export async function getOAuthToken(provider: string): Promise<OAuthTokenRow | null> {
  const client = await getClient();
  const res = await client.execute({
    sql: 'SELECT data, email, updated_at FROM oauth_tokens WHERE provider = ?',
    args: [provider],
  });
  const row = res.rows[0] as RawRow | undefined;
  if (!row) return null;
  return {
    data: String(row.data),
    email: row.email === null || row.email === undefined ? null : String(row.email),
    updated_at: String(row.updated_at),
  };
}

/** Insert or overwrite a provider's token row (UPSERT on the provider PK). */
export async function setOAuthToken(provider: string, data: string, email: string | null): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO oauth_tokens (provider, data, email, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (provider) DO UPDATE SET
            data       = excluded.data,
            email      = excluded.email,
            updated_at = excluded.updated_at`,
    args: [provider, data, email ?? null, new Date().toISOString()],
  });
}

/** Delete a provider's token row (no-op if absent). */
export async function deleteOAuthToken(provider: string): Promise<void> {
  const client = await getClient();
  await client.execute({ sql: 'DELETE FROM oauth_tokens WHERE provider = ?', args: [provider] });
}

/* ------------------------------------------------ timeline writes (sync use) */

/** A timeline row to insert; id/date/time/title/detail/source minus the PK. */
export interface TimelineInsert {
  date: string;
  time: string;
  title: string;
  detail: string;
  source: string;
}

/** Delete all timeline rows for a given date + source (e.g. one day's calendar). */
export async function deleteTimelineBySource(date: string, source: string): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: 'DELETE FROM timeline WHERE date = ? AND source = ?',
    args: [date, source],
  });
}

/** Bulk-insert timeline rows in a single transaction (one write batch). */
export async function insertTimelineItems(items: TimelineInsert[]): Promise<void> {
  if (items.length === 0) return;
  const client = await getClient();
  await client.batch(
    items.map((r) => ({
      sql: 'INSERT INTO timeline (date, time, title, detail, source) VALUES (?, ?, ?, ?, ?)',
      args: [r.date, r.time, r.title, r.detail, r.source] as InValue[],
    })),
    'write'
  );
}

/**
 * Idempotently replace today's calendar timeline: delete every source='calendar'
 * row for `date`, then insert the provided items (forced to source='calendar').
 * Issued as one write batch so a re-sync never leaves a partial/duplicated day.
 */
export async function replaceCalendarTimeline(
  date: string,
  items: Omit<TimelineInsert, 'source'>[]
): Promise<void> {
  const client = await getClient();
  const statements = [
    {
      sql: 'DELETE FROM timeline WHERE date = ? AND source = ?',
      args: [date, 'calendar'] as InValue[],
    },
    ...items.map((r) => ({
      sql: 'INSERT INTO timeline (date, time, title, detail, source) VALUES (?, ?, ?, ?, ?)',
      args: [r.date, r.time, r.title, r.detail, 'calendar'] as InValue[],
    })),
  ];
  await client.batch(statements, 'write');
}
