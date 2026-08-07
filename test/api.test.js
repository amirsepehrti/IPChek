import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ipchek-api-'));
process.env.SYNC_INTERVAL_MINUTES = '0';
process.env.SYNC_ON_START = 'false';

const { sources } = await import('../src/sources/index.js');
const { createApp } = await import('../src/server.js');
const { parseCidr } = await import('../src/lib/ipnet.js');

sources.testsrc = {
  id: 'testsrc',
  name: 'Test source',
  nameFa: 'منبع آزمایشی',
  description: 'fixture',
  descriptionFa: 'fixture',
  license: 'test',
  families: [4, 6],
  async fetchCountry(code, { family }) {
    const nets = family === 6 ? ['2001:db8::/32'] : ['1.0.0.0/24', '1.0.1.0/24', '185.1.2.0/24'];
    return { nets: nets.map(parseCidr), meta: { source: 'testsrc', fetchedAt: new Date().toISOString() } };
  },
};

const server = createApp().listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const get = async (url) => {
  const response = await fetch(base + url);
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : await response.text() };
};
const post = async (url, body) => {
  const response = await fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

test('GET /api/health reports the version', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.version);
});

test('GET /api/meta describes sources, formats and categories', async () => {
  const { body } = await get('/api/meta');
  assert.ok(body.sources.length >= 4);
  assert.ok(body.formats.length >= 20);
  assert.ok(body.continents.AS.fa);
  assert.ok(body.popular.includes('IR'));
  assert.equal(typeof body.scheduler.enabled, 'boolean');
});

test('GET /api/countries returns the whole ISO list and filters it', async () => {
  const all = await get('/api/countries?source=testsrc');
  assert.ok(all.body.countries.length > 240);

  const search = await get('/api/countries?source=testsrc&q=iran');
  assert.equal(search.body.countries[0].code, 'IR');

  const persian = await get(`/api/countries?source=testsrc&q=${encodeURIComponent('ایران')}`);
  assert.equal(persian.body.countries[0].code, 'IR');

  const region = await get('/api/countries?source=testsrc&continent=SA');
  assert.ok(region.body.countries.every((c) => c.continent === 'SA'));
});

test('export renders a device config and fetches the data on demand', async () => {
  const { status, body, headers } = await get('/api/export/IR/mikrotik?family=4&source=testsrc');
  assert.equal(status, 200);
  assert.ok(body.includes('/ip firewall address-list'));
  // Adjacent /24s are merged by default.
  assert.ok(body.includes('address=1.0.0.0/23'));
  assert.equal(headers.get('x-ipchek-prefixes'), '2');
  assert.ok(headers.get('cache-control').includes('max-age'));
});

test('aggregate=false returns the source prefixes untouched', async () => {
  const { body, headers } = await get('/api/export/IR/plain?family=4&source=testsrc&aggregate=false');
  assert.equal(headers.get('x-ipchek-prefixes'), '3');
  assert.ok(body.includes('1.0.0.0/24'));
  assert.ok(body.includes('1.0.1.0/24'));
});

test('download sets a filename and nocomments strips the banner', async () => {
  const download = await get('/api/export/IR/plain?family=4&source=testsrc&download=1');
  assert.match(download.headers.get('content-disposition'), /attachment; filename="ipchek-ir-v4-plain\.txt"/);

  const bare = await get('/api/export/IR/plain?family=4&source=testsrc&nocomments=1');
  assert.ok(!bare.body.includes('#'), 'a bare list must be safe for strict URL-table parsers');
  assert.deepEqual(bare.body.trim().split('\n'), ['1.0.0.0/23', '185.1.2.0/24']);
});

test('the preview endpoint returns rendered text plus device notes', async () => {
  const { body } = await get('/api/preview/IR?family=4&source=testsrc&format=nftables');
  assert.equal(body.format, 'nftables');
  assert.ok(body.preview.includes('type ipv4_addr'));
  assert.ok(body.exporter.notes);
  assert.ok(body.exporter.notesFa);
  assert.ok(body.liveUrl.includes('/api/export/IR'));
  assert.ok(body.downloadUrl.includes('download=1'));
});

test('the space map endpoint returns 256 buckets', async () => {
  const { body } = await get('/api/spacemap/IR?family=4&source=testsrc');
  assert.equal(body.buckets.length, 256);
  assert.ok(body.buckets[1] > 0, '1.0.0.0/23 should light up bucket 1');
  assert.ok(body.buckets[185] > 0);
  assert.equal(body.buckets[7], 0);
});

test('bad input is rejected with a helpful message', async () => {
  const country = await get('/api/export/ZZ/plain');
  assert.equal(country.status, 400);
  assert.match(country.body.error, /ISO 3166-1/);

  const format = await get('/api/export/IR/not-a-router?source=testsrc');
  assert.equal(format.status, 400);
  assert.match(format.body.error, /unknown format/);

  const family = await get('/api/export/IR/plain?family=7&source=testsrc');
  assert.equal(family.status, 400);

  const source = await get('/api/export/IR/plain?source=nope');
  assert.equal(source.status, 400);
  assert.match(source.body.error, /unknown source/);

  const missing = await get('/api/does-not-exist');
  assert.equal(missing.status, 404);
});

test('monitors can be created, listed, paused and removed', async () => {
  const created = await post('/api/monitors', { country: 'IR', source: 'testsrc', family: 0, label: 'Iran' });
  assert.equal(created.status, 201);
  assert.equal(created.body.monitor.country, 'IR');
  assert.equal(created.body.monitor.enabled, true);
  // Creating a monitor checks it right away rather than waiting for the
  // scheduler, so there is something to compare against from the start.
  assert.equal(created.body.sync.results.length, 2, 'family 0 covers both IPv4 and IPv6');
  assert.ok(created.body.sync.results.every((r) => r.status !== 'error'));
  assert.ok(created.body.monitor.lastCheckedAt, 'the monitor records when it was checked');

  const id = created.body.monitor.id;
  const list = await get('/api/monitors');
  assert.ok(list.body.monitors.some((m) => m.id === id));
  assert.equal(list.body.monitors.find((m) => m.id === id).flag, '🇮🇷');

  const paused = await fetch(`${base}/api/monitors/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal((await paused.json()).monitor.enabled, false);

  const removed = await fetch(`${base}/api/monitors/${id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);

  const gone = await fetch(`${base}/api/monitors/${id}`, { method: 'DELETE' });
  assert.equal(gone.status, 404);
});

test('a monitor interval below five minutes is refused', async () => {
  const { status, body } = await post('/api/monitors', { country: 'DE', source: 'testsrc', family: 4, intervalMinutes: 1 });
  assert.equal(status, 400);
  assert.match(body.error, /at least 5/);
});

test('events are exposed with country metadata for the timeline', async () => {
  await post('/api/sync', { country: 'FR', source: 'testsrc', family: 4 });
  const { body } = await get('/api/events?limit=5');
  assert.ok(body.events.length > 0);
  const event = body.events[0];
  assert.ok(event.countryName);
  assert.ok(event.countryNameFa);
  assert.ok(event.flag);
  assert.ok(Date.parse(event.detectedAt) > 0);

  const detail = await get(`/api/events/${event.id}`);
  assert.ok(Array.isArray(detail.body.added));
  assert.ok(Array.isArray(detail.body.removed));

  assert.equal((await get('/api/events/999999')).status, 404);
});

test('stats summarise what is being tracked', async () => {
  const { body } = await get('/api/stats');
  assert.ok(body.countriesTracked >= 1);
  assert.ok(body.prefixes >= 1);
  assert.equal(typeof body.ipv4Addresses, 'string');
  assert.ok(body.ipv4AddressesHuman.length > 0);
});

test('CORS is open for reads so routers can fetch lists from anywhere', async () => {
  const { headers } = await get('/api/export/IR/plain?family=4&source=testsrc');
  assert.equal(headers.get('access-control-allow-origin'), '*');

  // A browser preflight for a read is allowed through.
  const preflight = await fetch(`${base}/api/export/IR/plain`, {
    method: 'OPTIONS',
    headers: { origin: 'https://example.com', 'access-control-request-method': 'GET' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
});

test('CORS does not let a foreign page change anything', async () => {
  // Without this, any site a user visits could add or delete watches on an
  // IPChek instance it can reach.
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const preflight = await fetch(`${base}/api/monitors`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': method,
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(preflight.status, 403, `${method} preflight must be refused`);
    assert.equal(preflight.headers.get('access-control-allow-origin'), null,
      `${method} preflight must not carry a permissive origin`);
  }

  // The write itself must not advertise itself as cross-origin readable.
  const written = await fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ country: 'IT', source: 'testsrc', family: 4 }),
  });
  assert.equal(written.headers.get('access-control-allow-origin'), null);
});

test.after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});
