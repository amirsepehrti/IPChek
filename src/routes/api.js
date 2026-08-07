import express from 'express';
import config from '../config.js';
import * as store from '../db/index.js';
import { allCountries, countryInfo, isValidCode, normalizeCode, CONTINENT_NAMES, POPULAR } from '../lib/countries.js';
import { describeSources, sourceIds } from '../sources/index.js';
import { CATEGORIES, describeExporters, render } from '../exporters/index.js';
import { getPrefixes, syncMonitor, syncTarget, familiesOf } from '../core/sync.js';
import { schedulerStatus } from '../core/scheduler.js';
import { configuredChannels, sendTestNotification } from '../notify/index.js';
import { countAddresses, describeCount } from '../lib/ipnet.js';
import { buildSpaceMap } from '../lib/spacemap.js';

export const router = express.Router();

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const fail = (status, message) => Object.assign(new Error(message), { status });

function readCountry(value) {
  const code = normalizeCode(value);
  if (!isValidCode(code)) throw fail(400, `"${value}" is not an ISO 3166-1 alpha-2 country code`);
  return code;
}

function readFamily(value, { allowBoth = false } = {}) {
  if (value === undefined || value === '') return 4;
  const family = Number(value);
  if (family === 4 || family === 6 || (allowBoth && family === 0)) return family;
  throw fail(400, `family must be 4${allowBoth ? ', 6 or 0 (both)' : ' or 6'}`);
}

function readSource(value) {
  const source = String(value || config.defaultSource).toLowerCase();
  const available = sourceIds();
  if (!available.includes(source)) throw fail(400, `unknown source "${value}" (available: ${available.join(', ')})`);
  return source;
}

const readBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

/** Write endpoints are gated when API_TOKEN is configured. */
export function requireAuth(req, res, next) {
  if (!config.apiToken) return next();
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (token === config.apiToken) return next();
  return next(fail(401, 'missing or invalid API token'));
}

function selfUrlFor(req, country, family, format) {
  const host = req.get('host');
  if (!host) return null;
  return `${req.protocol}://${host}/api/export/${country}?family=${family}&format=${format}`;
}

/* -------------------------------------------------------------------------- */
/* metadata                                                                    */
/* -------------------------------------------------------------------------- */

router.get('/health', (req, res) => {
  res.json({ ok: true, version: config.version, uptimeSeconds: Math.round(process.uptime()) });
});

router.get('/meta', (req, res) => {
  res.json({
    version: config.version,
    defaultSource: config.defaultSource,
    sources: describeSources(),
    formats: describeExporters(),
    categories: CATEGORIES,
    continents: CONTINENT_NAMES,
    popular: POPULAR,
    scheduler: schedulerStatus(),
    notifications: configuredChannels(),
    authRequired: !!config.apiToken,
    eventRetention: config.eventRetention,
  });
});

router.get('/stats', (req, res) => {
  const datasets = store.listDatasets();
  const monitors = store.listMonitors();
  let addresses = 0n;
  for (const dataset of datasets) {
    if (dataset.family === 4) addresses += BigInt(dataset.addressCount);
  }
  res.json({
    countriesTracked: new Set(datasets.map((d) => d.country)).size,
    datasets: datasets.length,
    prefixes: datasets.reduce((sum, d) => sum + d.prefixCount, 0),
    ipv4Addresses: String(addresses),
    ipv4AddressesHuman: describeCount(4, addresses),
    monitors: { total: monitors.length, enabled: monitors.filter((m) => m.enabled).length,
      failing: monitors.filter((m) => m.lastStatus === 'error').length },
    events: store.eventStats(),
    scheduler: schedulerStatus(),
  });
});

/* -------------------------------------------------------------------------- */
/* countries                                                                   */
/* -------------------------------------------------------------------------- */

router.get('/countries', (req, res) => {
  const source = readSource(req.query.source);
  const datasets = store.listDatasets().filter((d) => d.source === source);
  const byCountry = new Map();
  for (const dataset of datasets) {
    if (!byCountry.has(dataset.country)) byCountry.set(dataset.country, {});
    byCountry.get(dataset.country)[dataset.family] = dataset;
  }
  const monitored = new Set(store.listMonitors().filter((m) => m.source === source).map((m) => m.country));

  const term = String(req.query.q || '').trim().toLowerCase();
  const continent = String(req.query.continent || '').toUpperCase();

  const list = allCountries()
    .filter((country) => {
      if (continent && country.continent !== continent) return false;
      if (!term) return true;
      return (
        country.code.toLowerCase().includes(term) ||
        country.name.toLowerCase().includes(term) ||
        country.nameFa.includes(term)
      );
    })
    .map((country) => ({
      ...country,
      monitored: monitored.has(country.code),
      datasets: byCountry.get(country.code) || null,
    }));

  res.json({ source, total: list.length, countries: list });
});

router.get('/countries/:code', async (req, res) => {
  const country = readCountry(req.params.code);
  const source = readSource(req.query.source);
  const info = countryInfo(country);

  const datasets = {};
  for (const family of [4, 6]) {
    const summary = store.getDatasetSummary(country, source, family);
    if (summary) {
      datasets[family] = {
        ...summary,
        addressCountHuman: describeCount(family, BigInt(summary.addressCount)),
      };
    }
  }

  const monitors = store.listMonitors().filter((m) => m.country === country);
  const { events } = store.listEvents({ country, source, limit: 20 });

  res.json({ ...info, source, datasets, monitors, events });
});

/* -------------------------------------------------------------------------- */
/* prefixes and exports                                                        */
/* -------------------------------------------------------------------------- */

router.get('/prefixes/:code', async (req, res) => {
  const country = readCountry(req.params.code);
  const source = readSource(req.query.source);
  const family = readFamily(req.query.family);
  const aggregated = readBool(req.query.aggregate, true);
  const limit = Math.min(Number(req.query.limit) || 0, 200000);

  const { nets, prefixes, dataset } = await getPrefixes({
    country,
    source,
    family,
    aggregated,
    refresh: readBool(req.query.refresh, false),
  });

  const total = countAddresses(nets);
  res.json({
    country,
    source,
    family,
    aggregated,
    prefixCount: prefixes.length,
    addressCount: String(total),
    addressCountHuman: describeCount(family, total),
    dataset,
    prefixes: limit ? prefixes.slice(0, limit) : prefixes,
    truncated: limit > 0 && prefixes.length > limit,
  });
});

async function handleExport(req, res) {
  const country = readCountry(req.params.code);
  const format = String(req.params.format || req.query.format || 'plain').toLowerCase();
  const source = readSource(req.query.source);
  const family = readFamily(req.query.family);
  const aggregated = readBool(req.query.aggregate, true);

  const { nets, prefixes, dataset } = await getPrefixes({
    country,
    source,
    family,
    aggregated,
    refresh: readBool(req.query.refresh, false),
  });

  const output = render({
    format,
    country,
    family,
    nets,
    prefixes,
    source,
    dataset,
    aggregated,
    listName: req.query.list ? String(req.query.list).slice(0, 60) : null,
    options: {
      action: req.query.action === 'allow' ? 'allow' : 'block',
      comments: !readBool(req.query.nocomments, false),
    },
    selfUrl: selfUrlFor(req, country, family, format),
  });

  res.type(output.mime);
  // Devices poll these URLs on a schedule; a short cache keeps them cheap.
  res.set('cache-control', 'public, max-age=300');
  res.set('x-ipchek-prefixes', String(prefixes.length));
  if (dataset?.changedAt) res.set('x-ipchek-changed-at', dataset.changedAt);
  if (readBool(req.query.download, false)) {
    res.set('content-disposition', `attachment; filename="${output.filename}"`);
  }
  res.send(output.body);
}

router.get('/export/:code/:format', handleExport);
router.get('/export/:code', handleExport);

/** Preview returns the rendered text as JSON so the UI can show it inline. */
router.get('/preview/:code', async (req, res) => {
  const country = readCountry(req.params.code);
  const format = String(req.query.format || 'plain').toLowerCase();
  const source = readSource(req.query.source);
  const family = readFamily(req.query.family);
  const aggregated = readBool(req.query.aggregate, true);
  const maxLines = Math.min(Number(req.query.lines) || 400, 5000);

  const { nets, prefixes, dataset } = await getPrefixes({ country, source, family, aggregated });
  const output = render({
    format,
    country,
    family,
    nets,
    prefixes,
    source,
    dataset,
    aggregated,
    listName: req.query.list ? String(req.query.list).slice(0, 60) : null,
    options: { action: req.query.action === 'allow' ? 'allow' : 'block' },
    selfUrl: selfUrlFor(req, country, family, format),
  });

  const lines = output.body.split('\n');
  res.json({
    country,
    family,
    source,
    format,
    filename: output.filename,
    exporter: output.exporter,
    prefixCount: prefixes.length,
    addressCount: String(countAddresses(nets)),
    addressCountHuman: describeCount(family, countAddresses(nets)),
    dataset,
    totalLines: lines.length,
    truncated: lines.length > maxLines,
    preview: lines.slice(0, maxLines).join('\n'),
    downloadUrl: `/api/export/${country}/${format}?family=${family}&source=${source}&aggregate=${aggregated}&download=1`,
    liveUrl: selfUrlFor(req, country, family, format),
  });
});

/** 256-bucket coverage histogram — the data behind the address-space map. */
router.get('/spacemap/:code', async (req, res) => {
  const country = readCountry(req.params.code);
  const source = readSource(req.query.source);
  const family = readFamily(req.query.family);

  const { nets, dataset } = await getPrefixes({ country, source, family, aggregated: true });
  const total = countAddresses(nets);
  res.json({
    country,
    family,
    source,
    buckets: buildSpaceMap(nets, family),
    prefixCount: nets.length,
    addressCount: String(total),
    addressCountHuman: describeCount(family, total),
    dataset,
  });
});

/* -------------------------------------------------------------------------- */
/* monitors                                                                    */
/* -------------------------------------------------------------------------- */

router.get('/monitors', (req, res) => {
  const monitors = store.listMonitors().map((monitor) => {
    const info = countryInfo(monitor.country);
    const datasets = {};
    for (const family of familiesOf(monitor.family)) {
      const summary = store.getDatasetSummary(monitor.country, monitor.source, family);
      if (summary) {
        datasets[family] = { ...summary, addressCountHuman: describeCount(family, BigInt(summary.addressCount)) };
      }
    }
    return { ...monitor, name: info.name, nameFa: info.nameFa, flag: info.flag, datasets };
  });
  res.json({ monitors, defaultIntervalMinutes: config.syncIntervalMinutes });
});

router.post('/monitors', requireAuth, async (req, res) => {
  const country = readCountry(req.body?.country);
  const source = readSource(req.body?.source);
  const family = readFamily(req.body?.family, { allowBoth: true });
  const intervalMinutes = req.body?.intervalMinutes ? Number(req.body.intervalMinutes) : null;
  if (intervalMinutes !== null && (!Number.isFinite(intervalMinutes) || intervalMinutes < 5)) {
    throw fail(400, 'intervalMinutes must be at least 5');
  }

  const monitor = store.createMonitor({
    country,
    source,
    family,
    label: req.body?.label ? String(req.body.label).slice(0, 120) : null,
    intervalMinutes,
  });

  // Take the baseline immediately so the monitor has something to compare to.
  const sync = await syncMonitor(monitor, { reason: 'monitor-created' });
  res.status(201).json({ monitor: store.getMonitor(monitor.id), sync });
});

router.patch('/monitors/:id', requireAuth, (req, res) => {
  const monitor = store.updateMonitor(Number(req.params.id), {
    label: req.body?.label,
    enabled: req.body?.enabled,
    intervalMinutes: req.body?.intervalMinutes === null ? null : req.body?.intervalMinutes,
  });
  if (!monitor) throw fail(404, 'monitor not found');
  res.json({ monitor });
});

router.delete('/monitors/:id', requireAuth, (req, res) => {
  if (!store.deleteMonitor(Number(req.params.id))) throw fail(404, 'monitor not found');
  res.json({ deleted: true });
});

router.post('/monitors/:id/sync', requireAuth, async (req, res) => {
  const monitor = store.getMonitor(Number(req.params.id));
  if (!monitor) throw fail(404, 'monitor not found');
  const result = await syncMonitor(monitor, { force: true, reason: 'manual' });
  res.json({ monitor: store.getMonitor(monitor.id), ...result });
});

/* -------------------------------------------------------------------------- */
/* sync and events                                                             */
/* -------------------------------------------------------------------------- */

router.post('/sync', requireAuth, async (req, res) => {
  const country = readCountry(req.body?.country);
  const source = readSource(req.body?.source);
  const family = readFamily(req.body?.family, { allowBoth: true });

  const results = [];
  for (const one of familiesOf(family)) {
    results.push(
      await syncTarget({
        country,
        source,
        family: one,
        force: readBool(req.body?.force, true),
        allowEmpty: readBool(req.body?.allowEmpty, false),
        reason: 'manual',
      }),
    );
  }
  res.json({ results });
});

router.get('/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { events, total } = store.listEvents({
    country: req.query.country ? readCountry(req.query.country) : undefined,
    source: req.query.source ? readSource(req.query.source) : undefined,
    family: req.query.family ? readFamily(req.query.family) : undefined,
    type: req.query.type || undefined,
    limit,
    offset,
  });

  res.json({
    total,
    limit,
    offset,
    events: events.map((event) => ({ ...event, ...countryMeta(event.country) })),
  });
});

router.get('/events/:id', (req, res) => {
  const event = store.getEvent(Number(req.params.id));
  if (!event) throw fail(404, 'event not found');
  res.json({ ...event, ...countryMeta(event.country) });
});

function countryMeta(code) {
  const info = countryInfo(code);
  return { countryName: info.name, countryNameFa: info.nameFa, flag: info.flag };
}

/* -------------------------------------------------------------------------- */
/* notifications                                                               */
/* -------------------------------------------------------------------------- */

router.post('/notify/test', requireAuth, async (req, res) => {
  const delivered = await sendTestNotification();
  res.json({ delivered, configured: configuredChannels() });
});

export default router;
