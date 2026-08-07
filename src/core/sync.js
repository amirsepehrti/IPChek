import crypto from 'node:crypto';
import { getSource } from '../sources/index.js';
import { aggregate, countAddresses, diffNets, formatCidr, parsePrefixList, sortNets } from '../lib/ipnet.js';
import * as store from '../db/index.js';
import { notifyChange } from '../notify/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('sync');

const digestOf = (prefixes) => crypto.createHash('sha256').update(prefixes.join('\n')).digest('hex');

/** Tracks in-flight syncs so a manual click cannot stampede the scheduler. */
const inFlight = new Map();
const keyOf = (country, source, family) => `${country}:${source}:${family}`;

/**
 * Fetch one country/family from one source, compare it with what we already
 * have and record a timestamped event when the covered address space changes.
 *
 * Guards exist because a monitoring tool that reports a phantom "all ranges
 * removed" during a source outage is worse than one that reports nothing.
 */
export async function syncTarget({
  country,
  source,
  family,
  force = false,
  allowEmpty = false,
  allowPartial = false,
  reason = 'manual',
}) {
  const key = keyOf(country, source, family);
  if (inFlight.has(key)) return inFlight.get(key);

  const task = runSync({ country, source, family, force, allowEmpty, allowPartial, reason }).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, task);
  return task;
}

async function runSync({ country, source, family, force, allowEmpty, allowPartial, reason }) {
  const provider = getSource(source);
  const startedAt = new Date();
  const previous = store.getDataset(country, source, family);

  let fetched;
  try {
    fetched = await provider.fetchCountry(country, { family, force });
  } catch (error) {
    return recordFailure({ country, source, family, error, detectedAt: startedAt.toISOString() });
  }

  const rawNets = sortNets(fetched.nets);
  const aggregated = aggregate(rawNets);
  const canonical = aggregated.map(formatCidr);
  const digest = digestOf(canonical);
  const addressCount = countAddresses(aggregated);
  const detectedAt = new Date().toISOString();

  const previousNets = previous ? parsePrefixList(previous.prefixes).nets : [];
  const diff = previous ? diffNets(aggregate(previousNets), aggregated) : { added: [], removed: [] };
  const previousAddresses = previous ? BigInt(previous.addressCount) : 0n;

  /*
   * A registry we could not reach drops every country it serves, which would
   * read as a mass withdrawal — so a partial fetch is not trusted blindly.
   *
   * But it is only dangerous when it takes something away. Most countries are
   * served by a single registry, so an unreachable APNIC cannot affect a RIPE
   * country's list at all. When the partial data still covers everything we had
   * before, nothing was lost and the result is recorded normally; the moment it
   * would remove a block, we stop and say why. This check runs before the
   * empty-list guard so an unreachable registry is reported as exactly that,
   * rather than as a country that lost all its space.
   */
  if (fetched.meta?.partial && !allowPartial) {
    const failed = (fetched.meta.failedRegistries || []).map((f) => f.id).join(', ') || 'unknown';
    const advice =
      'If your network cannot reach these hosts, switch the source to "ipverse" — it mirrors the ' +
      'same registry data over HTTPS from GitHub.';

    if (!previous) {
      const error = new Error(
        `source "${source}" could not reach ${failed}, so the first recording of ${country} might be ` +
          `missing blocks — refusing to save an incomplete baseline. ${advice}`,
      );
      return recordFailure({ country, source, family, error, detectedAt });
    }
    if (diff.removed.length > 0) {
      const error = new Error(
        `source "${source}" could not reach ${failed}, and the result drops ${diff.removed.length} ` +
          `block(s) from ${country} — refusing, because that is what an unreachable registry looks like. ${advice}`,
      );
      return recordFailure({ country, source, family, error, detectedAt });
    }
    log.warn(`${country}/v${family}/${source}: ${failed} unreachable but nothing was lost — recording`);
  }

  if (aggregated.length === 0 && previous && previous.prefixCount > 0 && !allowEmpty) {
    const error = new Error(
      `source returned an empty list for ${country} while ${previous.prefixCount} prefixes are on record — ` +
        'refusing to overwrite. Re-run with allowEmpty if the country really has no allocations.',
    );
    return recordFailure({ country, source, family, error, detectedAt });
  }

  // Unchanged coverage: no event. The source may still have re-split the same
  // space into different prefixes, so refresh the stored raw copy quietly —
  // that keeps un-aggregated exports accurate without raising a false alarm.
  if (previous && previous.digest === digest) {
    const rawStrings = rawNets.map(formatCidr);
    if (rawStrings.join('\n') !== previous.prefixes.join('\n')) {
      store.saveDataset({
        country,
        source,
        family,
        prefixes: rawStrings,
        addressCount,
        digest,
        sourceFetchedAt: fetched.meta?.fetchedAt,
        syncedAt: detectedAt,
        changedAt: previous.changedAt,
      });
    } else {
      store.markDatasetChecked(country, source, family, detectedAt, fetched.meta?.fetchedAt);
    }
    log.debug(`${country}/v${family}/${source} unchanged (${canonical.length} prefixes)`);
    return {
      status: 'unchanged',
      country,
      source,
      family,
      detectedAt,
      prefixCount: previous.prefixCount,
      addressCount: previous.addressCount,
      sourceFetchedAt: fetched.meta?.fetchedAt,
      changedAt: previous.changedAt,
    };
  }

  store.saveDataset({
    country,
    source,
    family,
    prefixes: rawNets.map(formatCidr),
    addressCount,
    digest,
    sourceFetchedAt: fetched.meta?.fetchedAt,
    syncedAt: detectedAt,
    changedAt: detectedAt,
  });

  const isBaseline = !previous;
  const noSpaceChange = !isBaseline && diff.added.length === 0 && diff.removed.length === 0;

  const event = {
    country,
    source,
    family,
    type: isBaseline ? 'baseline' : 'change',
    detectedAt,
    added: diff.added,
    removed: diff.removed,
    prefixCountBefore: previous ? previous.prefixCount : null,
    prefixCountAfter: rawNets.length,
    addressCountBefore: previous ? previousAddresses : null,
    addressCountAfter: addressCount,
    addressDelta: previous ? addressCount - previousAddresses : null,
    message: isBaseline
      ? `Baseline recorded: ${canonical.length} aggregated prefixes`
      : noSpaceChange
        ? 'Prefix list reorganised — the same address space is covered by a different set of prefixes'
        : `${diff.added.length} block(s) added, ${diff.removed.length} block(s) removed`,
  };

  const eventId = store.recordEvent(event);
  if (!isBaseline) store.touchMonitorChange(country, source, family, detectedAt);
  log.info(
    `${country}/v${family}/${source} ${isBaseline ? 'baseline' : 'changed'}: ` +
      `+${diff.added.length} -${diff.removed.length} (${rawNets.length} prefixes, via ${reason})`,
  );

  if (!isBaseline) {
    notifyChange({ ...event, id: eventId }).catch((error) => log.warn(`notification failed: ${error.message}`));
  }

  return {
    status: isBaseline ? 'baseline' : 'changed',
    country,
    source,
    family,
    detectedAt,
    eventId,
    added: diff.added.length,
    removed: diff.removed.length,
    prefixCount: rawNets.length,
    addressCount: String(addressCount),
    sourceFetchedAt: fetched.meta?.fetchedAt,
    changedAt: detectedAt,
  };
}

function recordFailure({ country, source, family, error, detectedAt }) {
  log.error(`${country}/v${family}/${source} failed: ${error.message}`);
  store.recordEvent({
    country,
    source,
    family,
    type: 'error',
    detectedAt,
    message: error.message,
  });
  return { status: 'error', country, source, family, detectedAt, error: error.message };
}

/** Families a monitor covers — `0` means both. */
export const familiesOf = (family) => (family === 0 ? [4, 6] : [family]);

export async function syncMonitor(monitor, { force = false, reason = 'scheduler' } = {}) {
  const results = [];
  for (const family of familiesOf(monitor.family)) {
    results.push(await syncTarget({ country: monitor.country, source: monitor.source, family, force, reason }));
  }

  const checkedAt = new Date().toISOString();
  const failure = results.find((r) => r.status === 'error');
  const changed = results.find((r) => r.status === 'changed');
  store.markMonitorResult(monitor.id, {
    checkedAt,
    status: failure ? 'error' : 'ok',
    error: failure ? failure.error : null,
    changedAt: changed ? changed.detectedAt : null,
  });
  return { monitor: monitor.id, country: monitor.country, results };
}

/** Sync every enabled monitor, sequentially so we stay polite to the sources. */
export async function syncAllMonitors({ force = false, reason = 'scheduler' } = {}) {
  const monitors = store.listMonitors().filter((m) => m.enabled);
  const startedAt = new Date().toISOString();
  const results = [];
  for (const monitor of monitors) {
    try {
      results.push(await syncMonitor(monitor, { force, reason }));
    } catch (error) {
      log.error(`monitor ${monitor.id} (${monitor.country}) crashed: ${error.message}`);
      results.push({ monitor: monitor.id, country: monitor.country, error: error.message });
    }
  }
  const finishedAt = new Date().toISOString();
  store.setSetting('lastRun', { startedAt, finishedAt, monitors: monitors.length, reason });
  return { startedAt, finishedAt, monitors: monitors.length, results };
}

/**
 * Prefixes for a country, syncing on demand when nothing is cached yet.
 * This is what the export endpoints call, so a router can fetch a list for a
 * country nobody has monitored before.
 */
export async function getPrefixes({ country, source, family, aggregated = true, refresh = false }) {
  let dataset = store.getDataset(country, source, family);
  if (!dataset || refresh) {
    await syncTarget({ country, source, family, force: refresh, reason: 'on-demand' });
    dataset = store.getDataset(country, source, family);
  }
  if (!dataset) {
    return { nets: [], prefixes: [], dataset: null };
  }
  const { nets } = parsePrefixList(dataset.prefixes);
  const finalNets = aggregated ? aggregate(nets) : sortNets(nets);
  return {
    nets: finalNets,
    prefixes: finalNets.map(formatCidr),
    dataset: { ...dataset, prefixes: undefined },
  };
}
