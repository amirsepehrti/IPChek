import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import config from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('db');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS datasets (
  id                INTEGER PRIMARY KEY,
  country           TEXT    NOT NULL,
  source            TEXT    NOT NULL,
  family            INTEGER NOT NULL,
  prefix_count      INTEGER NOT NULL DEFAULT 0,
  address_count     TEXT    NOT NULL DEFAULT '0',
  digest            TEXT    NOT NULL DEFAULT '',
  prefixes          BLOB,
  source_fetched_at TEXT,
  synced_at         TEXT,
  changed_at        TEXT,
  UNIQUE (country, source, family)
);

CREATE TABLE IF NOT EXISTS monitors (
  id               INTEGER PRIMARY KEY,
  country          TEXT    NOT NULL,
  source           TEXT    NOT NULL,
  family           INTEGER NOT NULL,
  label            TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER,
  created_at       TEXT    NOT NULL,
  last_checked_at  TEXT,
  last_change_at   TEXT,
  last_status      TEXT,
  last_error       TEXT,
  UNIQUE (country, source, family)
);

CREATE TABLE IF NOT EXISTS events (
  id                   INTEGER PRIMARY KEY,
  country              TEXT    NOT NULL,
  source               TEXT    NOT NULL,
  family               INTEGER NOT NULL,
  type                 TEXT    NOT NULL,
  detected_at          TEXT    NOT NULL,
  added_count          INTEGER NOT NULL DEFAULT 0,
  removed_count        INTEGER NOT NULL DEFAULT 0,
  added                TEXT,
  removed              TEXT,
  prefix_count_before  INTEGER,
  prefix_count_after   INTEGER,
  address_count_before TEXT,
  address_count_after  TEXT,
  address_delta        TEXT,
  message              TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_time    ON events (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_target  ON events (country, source, family, detected_at DESC);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);

/* -------------------------------------------------------------------------- */
/* key/value settings                                                          */
/* -------------------------------------------------------------------------- */

const kvGet = db.prepare('SELECT value FROM kv WHERE key = ?');
const kvSet = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

export function getSetting(key, fallback = null) {
  const row = kvGet.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

export function setSetting(key, value) {
  kvSet.run(key, JSON.stringify(value));
}

/* -------------------------------------------------------------------------- */
/* datasets                                                                    */
/* -------------------------------------------------------------------------- */

const packPrefixes = (list) => zlib.gzipSync(Buffer.from(list.join('\n'), 'utf8'));
const unpackPrefixes = (blob) => {
  if (!blob || blob.length === 0) return [];
  const text = zlib.gunzipSync(blob).toString('utf8');
  return text ? text.split('\n') : [];
};

const selectDataset = db.prepare('SELECT * FROM datasets WHERE country = ? AND source = ? AND family = ?');
const upsertDataset = db.prepare(`
  INSERT INTO datasets (country, source, family, prefix_count, address_count, digest, prefixes, source_fetched_at, synced_at, changed_at)
  VALUES (@country, @source, @family, @prefixCount, @addressCount, @digest, @prefixes, @sourceFetchedAt, @syncedAt, @changedAt)
  ON CONFLICT (country, source, family) DO UPDATE SET
    prefix_count      = excluded.prefix_count,
    address_count     = excluded.address_count,
    digest            = excluded.digest,
    prefixes          = excluded.prefixes,
    source_fetched_at = excluded.source_fetched_at,
    synced_at         = excluded.synced_at,
    changed_at        = excluded.changed_at
`);
const touchDataset = db.prepare(
  'UPDATE datasets SET synced_at = ?, source_fetched_at = ? WHERE country = ? AND source = ? AND family = ?',
);

function mapDataset(row) {
  if (!row) return null;
  return {
    country: row.country,
    source: row.source,
    family: row.family,
    prefixCount: row.prefix_count,
    addressCount: row.address_count,
    digest: row.digest,
    prefixes: unpackPrefixes(row.prefixes),
    sourceFetchedAt: row.source_fetched_at,
    syncedAt: row.synced_at,
    changedAt: row.changed_at,
  };
}

export function getDataset(country, source, family) {
  return mapDataset(selectDataset.get(country, source, family));
}

/** Dataset row without the (potentially large) prefix list. */
export function getDatasetSummary(country, source, family) {
  const dataset = getDataset(country, source, family);
  if (!dataset) return null;
  delete dataset.prefixes;
  return dataset;
}

export function saveDataset(entry) {
  upsertDataset.run({
    country: entry.country,
    source: entry.source,
    family: entry.family,
    prefixCount: entry.prefixes.length,
    addressCount: String(entry.addressCount),
    digest: entry.digest,
    prefixes: packPrefixes(entry.prefixes),
    sourceFetchedAt: entry.sourceFetchedAt || null,
    syncedAt: entry.syncedAt,
    changedAt: entry.changedAt,
  });
}

export function markDatasetChecked(country, source, family, syncedAt, sourceFetchedAt) {
  touchDataset.run(syncedAt, sourceFetchedAt || null, country, source, family);
}

export function listDatasets() {
  return db
    .prepare(
      `SELECT country, source, family, prefix_count, address_count, source_fetched_at, synced_at, changed_at
       FROM datasets ORDER BY country, source, family`,
    )
    .all()
    .map((row) => ({
      country: row.country,
      source: row.source,
      family: row.family,
      prefixCount: row.prefix_count,
      addressCount: row.address_count,
      sourceFetchedAt: row.source_fetched_at,
      syncedAt: row.synced_at,
      changedAt: row.changed_at,
    }));
}

/* -------------------------------------------------------------------------- */
/* monitors                                                                    */
/* -------------------------------------------------------------------------- */

const mapMonitor = (row) =>
  row && {
    id: row.id,
    country: row.country,
    source: row.source,
    family: row.family,
    label: row.label,
    enabled: !!row.enabled,
    intervalMinutes: row.interval_minutes,
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    lastChangeAt: row.last_change_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
  };

export function listMonitors() {
  return db.prepare('SELECT * FROM monitors ORDER BY country, source, family').all().map(mapMonitor);
}

export function getMonitor(id) {
  return mapMonitor(db.prepare('SELECT * FROM monitors WHERE id = ?').get(id));
}

export function findMonitor(country, source, family) {
  return mapMonitor(db.prepare('SELECT * FROM monitors WHERE country = ? AND source = ? AND family = ?').get(country, source, family));
}

export function createMonitor({ country, source, family, label = null, intervalMinutes = null }) {
  const info = db
    .prepare(
      `INSERT INTO monitors (country, source, family, label, enabled, interval_minutes, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (country, source, family) DO UPDATE SET enabled = 1, label = excluded.label`,
    )
    .run(country, source, family, label, intervalMinutes, new Date().toISOString());
  return info.lastInsertRowid ? getMonitor(info.lastInsertRowid) : findMonitor(country, source, family);
}

export function updateMonitor(id, patch) {
  const current = getMonitor(id);
  if (!current) return null;
  db.prepare('UPDATE monitors SET label = ?, enabled = ?, interval_minutes = ? WHERE id = ?').run(
    patch.label !== undefined ? patch.label : current.label,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : current.enabled ? 1 : 0,
    patch.intervalMinutes !== undefined ? patch.intervalMinutes : current.intervalMinutes,
    id,
  );
  return getMonitor(id);
}

export function deleteMonitor(id) {
  return db.prepare('DELETE FROM monitors WHERE id = ?').run(id).changes > 0;
}

/**
 * Stamp every monitor covering this target with the time of a change.
 * A change is a change no matter which path found it — the scheduler, a manual
 * "check now", or an on-demand export — so the watch list must reflect all of
 * them, not only the ones that came through syncMonitor().
 */
export function touchMonitorChange(country, source, family, changedAt) {
  return db
    .prepare(
      `UPDATE monitors SET last_change_at = ?
       WHERE country = ? AND source = ? AND (family = ? OR family = 0)`,
    )
    .run(changedAt, country, source, family).changes;
}

export function markMonitorResult(id, { checkedAt, status, error = null, changedAt = null }) {
  db.prepare(
    `UPDATE monitors SET last_checked_at = ?, last_status = ?, last_error = ?,
       last_change_at = COALESCE(?, last_change_at) WHERE id = ?`,
  ).run(checkedAt, status, error, changedAt, id);
}

/* -------------------------------------------------------------------------- */
/* events                                                                      */
/* -------------------------------------------------------------------------- */

const insertEvent = db.prepare(`
  INSERT INTO events (country, source, family, type, detected_at, added_count, removed_count, added, removed,
                      prefix_count_before, prefix_count_after, address_count_before, address_count_after,
                      address_delta, message)
  VALUES (@country, @source, @family, @type, @detectedAt, @addedCount, @removedCount, @added, @removed,
          @prefixCountBefore, @prefixCountAfter, @addressCountBefore, @addressCountAfter, @addressDelta, @message)
`);

const MAX_STORED_PREFIXES = 5000;

export function recordEvent(event) {
  const info = insertEvent.run({
    country: event.country,
    source: event.source,
    family: event.family,
    type: event.type,
    detectedAt: event.detectedAt,
    addedCount: event.added?.length || 0,
    removedCount: event.removed?.length || 0,
    added: JSON.stringify((event.added || []).slice(0, MAX_STORED_PREFIXES)),
    removed: JSON.stringify((event.removed || []).slice(0, MAX_STORED_PREFIXES)),
    prefixCountBefore: event.prefixCountBefore ?? null,
    prefixCountAfter: event.prefixCountAfter ?? null,
    addressCountBefore: event.addressCountBefore != null ? String(event.addressCountBefore) : null,
    addressCountAfter: event.addressCountAfter != null ? String(event.addressCountAfter) : null,
    addressDelta: event.addressDelta != null ? String(event.addressDelta) : null,
    message: event.message || null,
  });
  pruneEvents(event.country, event.source, event.family);
  return info.lastInsertRowid;
}

function pruneEvents(country, source, family) {
  if (config.eventRetention <= 0) return;
  db.prepare(
    `DELETE FROM events WHERE id IN (
       SELECT id FROM events WHERE country = ? AND source = ? AND family = ?
       ORDER BY detected_at DESC, id DESC LIMIT -1 OFFSET ?
     )`,
  ).run(country, source, family, config.eventRetention);
}

const mapEvent = (row, { withPrefixes = false } = {}) => ({
  id: row.id,
  country: row.country,
  source: row.source,
  family: row.family,
  type: row.type,
  detectedAt: row.detected_at,
  addedCount: row.added_count,
  removedCount: row.removed_count,
  prefixCountBefore: row.prefix_count_before,
  prefixCountAfter: row.prefix_count_after,
  addressCountBefore: row.address_count_before,
  addressCountAfter: row.address_count_after,
  addressDelta: row.address_delta,
  message: row.message,
  ...(withPrefixes
    ? { added: JSON.parse(row.added || '[]'), removed: JSON.parse(row.removed || '[]') }
    : {}),
});

export function listEvents({ country, source, family, type, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (country) {
    where.push('country = ?');
    params.push(country);
  }
  if (source) {
    where.push('source = ?');
    params.push(source);
  }
  if (family) {
    where.push('family = ?');
    params.push(family);
  }
  if (type) {
    where.push('type = ?');
    params.push(type);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM events ${clause} ORDER BY detected_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM events ${clause}`).get(...params).n;
  return { events: rows.map((row) => mapEvent(row)), total };
}

export function getEvent(id) {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return row ? mapEvent(row, { withPrefixes: true }) : null;
}

export function eventStats() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  return {
    total: db.prepare('SELECT COUNT(*) AS n FROM events').get().n,
    changes: db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'change'").get().n,
    lastWeek: db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'change' AND detected_at >= ?").get(since).n,
    errors: db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'error'").get().n,
    latest: db.prepare('SELECT detected_at FROM events ORDER BY detected_at DESC LIMIT 1').get()?.detected_at || null,
  };
}

log.debug(`database ready at ${config.dbFile}`);
