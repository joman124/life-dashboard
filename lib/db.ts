/**
 * lib/db.ts — better-sqlite3 singleton + schema init + typed row helpers.
 *
 * The Database handle is cached on globalThis so it survives Next.js dev-server
 * hot reloads (each reload re-evaluates modules but shares the same global).
 *
 * All reads/writes in API routes go through the typed helpers below; they are
 * the single place where SQLite storage shapes (active INTEGER 0/1) are
 * serialized to/from the domain types (active: boolean).
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Entry, Metric, TimelineItem } from '@/lib/types';
import { seed } from '@/lib/seed';

export type DB = Database.Database;

/* ---------------------------------------------------------------- schema */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS metrics (
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
);

CREATE TABLE IF NOT EXISTS entries (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  metricId TEXT NOT NULL REFERENCES metrics(id),
  date     TEXT NOT NULL,
  value    REAL NOT NULL,
  UNIQUE (metricId, date)
);

CREATE TABLE IF NOT EXISTS timeline (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  date   TEXT NOT NULL,
  time   TEXT NOT NULL,
  title  TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  source TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Connector OAuth tokens. provider is the PK (one row per connector), so the
-- table is extensible: future wearables (Oura, Whoop, Fitbit) reuse it by
-- inserting their own provider row. data holds the serialized token JSON
-- (plaintext, or AES-256-GCM ciphertext when TOKEN_ENCRYPTION_KEY is set).
CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider   TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  email      TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_date  ON entries(date);
CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline(date);
`;

/* ------------------------------------------------------------- singleton */

const globalForDb = globalThis as unknown as { __lifeDashboardDb?: DB };

export function getDb(): DB {
  if (globalForDb.__lifeDashboardDb) return globalForDb.__lifeDashboardDb;

  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'life-dashboard.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM metrics').get() as { n: number };
  if (n === 0) seed(db);

  globalForDb.__lifeDashboardDb = db;
  return db;
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
  active: number; // 0 | 1 in SQLite
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

export function listMetrics(): Metric[] {
  const rows = getDb().prepare('SELECT * FROM metrics ORDER BY rowid').all() as MetricRow[];
  return rows.map(rowToMetric);
}

export function getMetricById(id: string): Metric | null {
  const row = getDb().prepare('SELECT * FROM metrics WHERE id = ?').get(id) as MetricRow | undefined;
  return row ? rowToMetric(row) : null;
}

export function createMetric(metric: Metric): Metric {
  getDb()
    .prepare(
      `INSERT INTO metrics (id, name, emoji, unit, goal, goalDirection, step, "max", active, category, description)
       VALUES (@id, @name, @emoji, @unit, @goal, @goalDirection, @step, @max, @active, @category, @description)`
    )
    .run({ ...metric, active: metric.active ? 1 : 0 });
  return getMetricById(metric.id) as Metric;
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
export function updateMetric(id: string, patch: MetricPatch): Metric | null {
  const existing = getMetricById(id);
  if (!existing) return null;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const col of METRIC_PATCH_COLUMNS) {
    const value = patch[col];
    if (value === undefined) continue;
    sets.push(`"${col}" = @${col}`);
    params[col] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }
  if (sets.length > 0) {
    getDb().prepare(`UPDATE metrics SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }
  return getMetricById(id);
}

/* ----------------------------------------------------------------- entries */

export function listEntriesBetween(startDate: string, endDate: string): Entry[] {
  const rows = getDb()
    .prepare('SELECT metricId, date, value FROM entries WHERE date >= ? AND date <= ? ORDER BY date, metricId')
    .all(startDate, endDate) as EntryRow[];
  return rows.map(rowToEntry);
}

export function listAllEntries(): Entry[] {
  const rows = getDb()
    .prepare('SELECT metricId, date, value FROM entries ORDER BY date, metricId')
    .all() as EntryRow[];
  return rows.map(rowToEntry);
}

/** Insert or overwrite the value for (metricId, date) — UNIQUE upsert per spec. */
export function upsertEntry(metricId: string, date: string, value: number): Entry {
  getDb()
    .prepare(
      `INSERT INTO entries (metricId, date, value) VALUES (?, ?, ?)
       ON CONFLICT (metricId, date) DO UPDATE SET value = excluded.value`
    )
    .run(metricId, date, value);
  return { metricId, date, value };
}

/* ---------------------------------------------------------------- timeline */

export function listTimelineForDate(date: string): TimelineItem[] {
  const rows = getDb()
    .prepare('SELECT id, date, time, title, detail, source FROM timeline WHERE date = ? ORDER BY time, id')
    .all(date) as TimelineRow[];
  return rows.map(rowToTimelineItem);
}

/* -------------------------------------------------------------- sync_state */

export function getSyncValue(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined;
  return row?.value ?? null;
}

/** Insert or overwrite a sync_state value (UPSERT on the key PK). */
export function setSyncValue(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO sync_state (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

/** Delete a sync_state row (no-op if the key is absent). */
export function deleteSyncValue(key: string): void {
  getDb().prepare('DELETE FROM sync_state WHERE key = ?').run(key);
}

/* ------------------------------------------------------------- oauth_tokens */

export interface OAuthTokenRow {
  /** Serialized token JSON — plaintext or AES-256-GCM ciphertext. */
  data: string;
  email: string | null;
  updated_at: string;
}

/** Returns the stored token row for a provider, or null if none. */
export function getOAuthToken(provider: string): OAuthTokenRow | null {
  const row = getDb()
    .prepare('SELECT data, email, updated_at FROM oauth_tokens WHERE provider = ?')
    .get(provider) as OAuthTokenRow | undefined;
  return row ?? null;
}

/** Insert or overwrite a provider's token row (UPSERT on the provider PK). */
export function setOAuthToken(provider: string, data: string, email: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO oauth_tokens (provider, data, email, updated_at)
       VALUES (@provider, @data, @email, @updated_at)
       ON CONFLICT (provider) DO UPDATE SET
         data       = excluded.data,
         email      = excluded.email,
         updated_at = excluded.updated_at`
    )
    .run({ provider, data, email: email ?? null, updated_at: new Date().toISOString() });
}

/** Delete a provider's token row (no-op if absent). */
export function deleteOAuthToken(provider: string): void {
  getDb().prepare('DELETE FROM oauth_tokens WHERE provider = ?').run(provider);
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
export function deleteTimelineBySource(date: string, source: string): void {
  getDb().prepare('DELETE FROM timeline WHERE date = ? AND source = ?').run(date, source);
}

/** Bulk-insert timeline rows in a single transaction. */
export function insertTimelineItems(items: TimelineInsert[]): void {
  if (items.length === 0) return;
  const stmt = getDb().prepare(
    'INSERT INTO timeline (date, time, title, detail, source) VALUES (@date, @time, @title, @detail, @source)'
  );
  const insertMany = getDb().transaction((rows: TimelineInsert[]) => {
    for (const r of rows) stmt.run(r);
  });
  insertMany(items);
}

/**
 * Idempotently replace today's calendar timeline: delete every source='calendar'
 * row for `date`, then insert the provided items (forced to source='calendar').
 * Wrapped in one transaction so a re-sync never leaves a partial/duplicated day.
 */
export function replaceCalendarTimeline(date: string, items: Omit<TimelineInsert, 'source'>[]): void {
  const del = getDb().prepare('DELETE FROM timeline WHERE date = ? AND source = ?');
  const ins = getDb().prepare(
    'INSERT INTO timeline (date, time, title, detail, source) VALUES (@date, @time, @title, @detail, @source)'
  );
  const replace = getDb().transaction((d: string, rows: Omit<TimelineInsert, 'source'>[]) => {
    del.run(d, 'calendar');
    for (const r of rows) ins.run({ ...r, source: 'calendar' });
  });
  replace(date, items);
}
