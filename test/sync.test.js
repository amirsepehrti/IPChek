import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A throwaway database per run, set before anything reads the config.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ipchek-sync-'));
process.env.SYNC_INTERVAL_MINUTES = '0';

const { sources } = await import('../src/sources/index.js');
const store = await import('../src/db/index.js');
const { syncTarget, syncMonitor, getPrefixes } = await import('../src/core/sync.js');
const { parseCidr, formatCidr } = await import('../src/lib/ipnet.js');

/** A source we can drive from the test, standing in for a registry. */
function fakeSource(id, initial) {
  const source = {
    id,
    name: id,
    nameFa: id,
    description: 'test',
    descriptionFa: 'test',
    license: 'test',
    families: [4, 6],
    prefixes: initial,
    meta: {},
    async fetchCountry() {
      if (source.error) throw new Error(source.error);
      return {
        nets: source.prefixes.map(parseCidr),
        meta: { source: id, fetchedAt: new Date().toISOString(), ...source.meta },
      };
    },
  };
  sources[id] = source;
  return source;
}

test('the first sync records a baseline, not a change', async () => {
  const source = fakeSource('t-baseline', ['1.0.0.0/24', '2.0.0.0/24']);
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4 });

  assert.equal(result.status, 'baseline');
  assert.equal(result.prefixCount, 2);
  assert.equal(result.addressCount, '512');

  const { events } = store.listEvents({ country: 'IR', source: source.id });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'baseline');
  assert.ok(Date.parse(events[0].detectedAt) > 0, 'every event carries a parsable timestamp');
});

test('an unchanged source produces no second event', async () => {
  const source = fakeSource('t-unchanged', ['1.0.0.0/24']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });
  const again = await syncTarget({ country: 'IR', source: source.id, family: 4 });

  assert.equal(again.status, 'unchanged');
  assert.equal(store.listEvents({ country: 'IR', source: source.id }).total, 1);
});

test('a change is recorded with the exact blocks that moved', async () => {
  const source = fakeSource('t-change', ['1.0.0.0/24', '2.0.0.0/24']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });

  source.prefixes = ['1.0.0.0/24', '3.0.0.0/24'];
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4 });

  assert.equal(result.status, 'changed');
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);

  const event = store.getEvent(result.eventId);
  assert.equal(event.type, 'change');
  assert.deepEqual(event.added, ['3.0.0.0/24']);
  assert.deepEqual(event.removed, ['2.0.0.0/24']);
  assert.equal(event.prefixCountBefore, 2);
  assert.equal(event.prefixCountAfter, 2);
  assert.equal(event.addressDelta, '0', 'equal-sized swap nets out to zero addresses');
});

test('re-splitting the same space is not reported as a change', async () => {
  const source = fakeSource('t-resplit', ['1.0.0.0/23']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });

  source.prefixes = ['1.0.0.0/24', '1.0.1.0/24'];
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4 });

  assert.equal(result.status, 'unchanged');
  assert.equal(store.listEvents({ country: 'IR', source: source.id }).total, 1);

  // The stored copy still refreshes, so un-aggregated exports stay accurate.
  const raw = await getPrefixes({ country: 'IR', source: source.id, family: 4, aggregated: false });
  assert.deepEqual(raw.prefixes, ['1.0.0.0/24', '1.0.1.0/24']);
});

test('an empty response never wipes an existing list', async () => {
  const source = fakeSource('t-empty', ['1.0.0.0/24', '2.0.0.0/24']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });

  source.prefixes = [];
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4 });

  assert.equal(result.status, 'error');
  assert.match(result.error, /refusing to overwrite/);

  // The previous data survives untouched.
  const dataset = store.getDataset('IR', source.id, 4);
  assert.equal(dataset.prefixCount, 2);

  const { events } = store.listEvents({ country: 'IR', source: source.id, type: 'error' });
  assert.equal(events.length, 1);
});

test('an empty response is accepted when explicitly allowed', async () => {
  const source = fakeSource('t-empty-ok', ['1.0.0.0/24']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });

  source.prefixes = [];
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4, allowEmpty: true });
  assert.equal(result.status, 'changed');
  assert.equal(result.removed, 1);
});

test('partial source data is refused rather than reported as a withdrawal', async () => {
  const source = fakeSource('t-partial', ['1.0.0.0/24']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });

  // One registry of five went down: the country's list would look truncated.
  source.prefixes = [];
  source.meta = { partial: true, failedRegistries: [{ id: 'apnic', error: 'timeout' }] };
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4 });

  assert.equal(result.status, 'error');
  assert.match(result.error, /partial data/);
  assert.match(result.error, /apnic/);
  assert.equal(store.getDataset('IR', source.id, 4).prefixCount, 1);
});

test('a fetch failure is recorded as an error event, not a change', async () => {
  const source = fakeSource('t-fail', ['1.0.0.0/24']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });

  source.error = 'connection refused';
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4 });
  assert.equal(result.status, 'error');
  assert.match(result.error, /connection refused/);
  assert.equal(store.listEvents({ country: 'IR', source: source.id, type: 'change' }).total, 0);
});

test('a change stamps every monitor that covers the target', async () => {
  const source = fakeSource('t-monitor', ['1.0.0.0/24']);
  const monitor = store.createMonitor({ country: 'IR', source: source.id, family: 0 });
  await syncMonitor(monitor, { reason: 'test' });
  assert.equal(store.getMonitor(monitor.id).lastChangeAt, null, 'a baseline is not a change');

  source.prefixes = ['1.0.0.0/24', '4.4.4.0/24'];
  // Sync the target directly rather than through the monitor: the watch list
  // must still learn about it.
  const result = await syncTarget({ country: 'IR', source: source.id, family: 4 });
  assert.equal(result.status, 'changed');

  const updated = store.getMonitor(monitor.id);
  assert.equal(updated.lastChangeAt, result.detectedAt);
});

test('a failing monitor keeps its error visible on the watch list', async () => {
  const source = fakeSource('t-monitor-fail', ['1.0.0.0/24']);
  const monitor = store.createMonitor({ country: 'DE', source: source.id, family: 4 });
  await syncMonitor(monitor, { reason: 'test' });

  source.error = 'source unreachable';
  await syncMonitor(monitor, { reason: 'test' });

  const updated = store.getMonitor(monitor.id);
  assert.equal(updated.lastStatus, 'error');
  assert.match(updated.lastError, /source unreachable/);
});

test('IPv6 syncs independently of IPv4', async () => {
  const source = fakeSource('t-v6', ['2001:db8::/32']);
  const v6 = await syncTarget({ country: 'IR', source: source.id, family: 6 });
  assert.equal(v6.status, 'baseline');
  assert.equal(v6.prefixCount, 1);

  const stored = await getPrefixes({ country: 'IR', source: source.id, family: 6 });
  assert.deepEqual(stored.prefixes, ['2001:db8::/32']);
  assert.equal(store.getDataset('IR', source.id, 4), null, 'v4 must be untouched');
});

test('getPrefixes aggregates on demand without losing the raw list', async () => {
  const source = fakeSource('t-agg', ['10.0.0.0/24', '10.0.1.0/24']);
  await syncTarget({ country: 'IR', source: source.id, family: 4 });

  const merged = await getPrefixes({ country: 'IR', source: source.id, family: 4, aggregated: true });
  assert.deepEqual(merged.prefixes, ['10.0.0.0/23']);

  const raw = await getPrefixes({ country: 'IR', source: source.id, family: 4, aggregated: false });
  assert.deepEqual(raw.prefixes, ['10.0.0.0/24', '10.0.1.0/24']);
  assert.deepEqual(raw.nets.map(formatCidr), raw.prefixes);
});

test('events are returned newest first and can be filtered', async () => {
  const source = fakeSource('t-order', ['1.0.0.0/24']);
  await syncTarget({ country: 'FR', source: source.id, family: 4 });
  source.prefixes = ['1.0.0.0/24', '9.9.9.0/24'];
  await syncTarget({ country: 'FR', source: source.id, family: 4 });

  const { events } = store.listEvents({ country: 'FR', source: source.id });
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'change');
  assert.equal(events[1].type, 'baseline');
  assert.ok(events[0].detectedAt >= events[1].detectedAt);

  assert.equal(store.listEvents({ country: 'FR', source: source.id, type: 'change' }).total, 1);
});

test.after(() => {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});
