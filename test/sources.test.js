import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelegatedFile } from '../src/sources/rir.js';
import { describeSources, getSource, sourceIds } from '../src/sources/index.js';
import { formatCidr, countAddresses, parseCidr } from '../src/lib/ipnet.js';
import { buildSpaceMap, bucketOf, BUCKETS } from '../src/lib/spacemap.js';
import { countryInfo, isValidCode, allCountries, flagOf, searchCountries } from '../src/lib/countries.js';

/* -------------------------------------------------------------- RIR parsing */

const SAMPLE = `2|ripencc|20260101|1000|19830101|20260101|+0000
ripencc|*|ipv4|*|500|summary
ripencc|IR|ipv4|2.144.0.0|262144|20110101|allocated|xyz
ripencc|IR|ipv4|5.22.0.0|32768|20120101|assigned|xyz
ripencc|IR|ipv6|2001:678:b0::|46|20130101|allocated|xyz
ripencc|DE|ipv4|5.1.0.0|1024|20120101|allocated|xyz
ripencc|IR|ipv4|1.1.1.0|256|20120101|reserved|xyz
ripencc|IR|asn|12345|1|20120101|allocated|xyz
# a comment
ripencc|IR|ipv4|91.98.0.0|100000|20140101|allocated|xyz
malformed line without pipes`;

test('parses the RIR delegated-extended format', () => {
  const { index, records } = parseDelegatedFile(SAMPLE);
  assert.equal(records, 5, 'only allocated/assigned ipv4+ipv6 rows count');

  const ir = index.get('IR');
  assert.ok(ir, 'IR should be present');
  // 262144 addresses starting at 2.144.0.0 is exactly a /14.
  assert.ok(ir[4].map(formatCidr).includes('2.144.0.0/14'));
  assert.ok(ir[4].map(formatCidr).includes('5.22.0.0/17'));
  assert.deepEqual(ir[6].map(formatCidr), ['2001:678:b0::/46']);

  assert.deepEqual(index.get('DE')[4].map(formatCidr), ['5.1.0.0/22']);
});

test('reserved space, ASNs, summary rows and junk are all skipped', () => {
  const { index } = parseDelegatedFile(SAMPLE);
  const ir = index.get('IR');
  assert.ok(!ir[4].map(formatCidr).includes('1.1.1.0/24'), 'reserved blocks must not be exported');
  assert.ok(!index.has('*'), 'summary rows must not become a country');
});

test('address counts that are not powers of two become multiple CIDRs', () => {
  // 100000 addresses cannot be one prefix; the pieces must total exactly and
  // be contiguous from the start address.
  const { index } = parseDelegatedFile('ripencc|IR|ipv4|91.98.0.0|100000|20140101|allocated|xyz');
  const pieces = index.get('IR')[4];
  assert.ok(pieces.length > 1, 'expected the range to be split');
  assert.equal(countAddresses(pieces), 100000n);
  assert.equal(formatCidr(pieces[0]), '91.98.0.0/16');
});

/* ------------------------------------------------------------ source registry */

test('every source declares the metadata the UI depends on', () => {
  for (const id of sourceIds()) {
    const source = getSource(id);
    assert.equal(source.id, id);
    assert.ok(source.families.length > 0);
    assert.equal(typeof source.fetchCountry, 'function');
  }
  for (const described of describeSources()) {
    assert.ok(described.name && described.nameFa, `${described.id} needs both names`);
    assert.ok(described.description && described.descriptionFa, `${described.id} needs both descriptions`);
    assert.ok(described.license, `${described.id} must state its licence`);
  }
});

test('an unknown source is rejected with the list of valid ones', () => {
  assert.throws(() => getSource('nope'), /unknown source/);
});

/* ------------------------------------------------------------------ countries */

test('country metadata is complete and localised', () => {
  const list = allCountries();
  assert.ok(list.length > 240, `expected the full ISO list, got ${list.length}`);

  const iran = countryInfo('ir');
  assert.equal(iran.code, 'IR');
  assert.equal(iran.name, 'Iran');
  assert.equal(iran.nameFa, 'ایران');
  assert.equal(iran.flag, '🇮🇷');
  assert.equal(iran.continent, 'AS');

  assert.ok(isValidCode('de'));
  assert.ok(!isValidCode('ZZ'));
  assert.ok(!isValidCode('USA'));
  assert.equal(flagOf('US'), '🇺🇸');

  // Every country lands in exactly one continent bucket.
  assert.ok(list.every((country) => country.continent), 'a country without a continent breaks the region filter');
});

test('country search matches code, English name and Persian name', () => {
  assert.ok(searchCountries('ایران').some((c) => c.code === 'IR'));
  assert.ok(searchCountries('germ').some((c) => c.code === 'DE'));
  assert.ok(searchCountries('ir').some((c) => c.code === 'IR'));
  assert.equal(searchCountries('zzzzz').length, 0);
});

/* ------------------------------------------------------------------ space map */

test('the IPv4 space map reports coverage per /8', () => {
  const buckets = buildSpaceMap([parseCidr('5.0.0.0/8'), parseCidr('185.1.2.0/24')], 4);
  assert.equal(buckets.length, BUCKETS);
  assert.equal(buckets[5], 1, 'a full /8 is complete coverage');
  assert.ok(buckets[185] > 0 && buckets[185] < 0.01, 'a /24 is a sliver of its /8');
  assert.equal(buckets[6], 0);
  assert.equal(bucketOf(4, parseCidr('185.1.2.0/24').base), 185);
});

test('the IPv6 space map reports allocation density inside 2000::/3', () => {
  const nets = ['2001:db8::/32', '2001:db9::/32', '2a00:1450::/32'].map(parseCidr);
  const buckets = buildSpaceMap(nets, 6);
  assert.equal(buckets.length, BUCKETS);

  const busiest = buckets.indexOf(Math.max(...buckets));
  assert.equal(buckets[busiest], 1, 'the densest bucket normalises to full height');
  assert.ok(buckets.some((value) => value > 0 && value < 1), 'a lone allocation is shorter than a pair');
  // Anything outside global unicast is off the map rather than clamped to zero.
  assert.equal(bucketOf(6, parseCidr('fe80::/10').base), -1);
});

/* ------------------------------------------------------- RIR mirror fallback */

test('a registry blocked on its own host is fetched from a mirror', async () => {
  // The registries carry each other's files. A network that cannot reach
  // ftp.apnic.net can usually still reach ftp.ripe.net, and the file is the
  // same either way — without this, one blocked host breaks the whole source.
  const http = await import('node:http');
  const sample = 'ripencc|IR|ipv4|2.144.0.0|262144|20110101|allocated|x';

  const server = http.createServer((req, res) => {
    if (req.url.includes('/blocked/')) return req.socket.destroy();
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(sample);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const rir = await import('../src/sources/rir.js');
  const original = [...rir.REGISTRIES];
  rir.REGISTRIES.length = 0;
  rir.REGISTRIES.push(
    { id: 'ripencc', name: 'RIPE NCC', urls: [`${base}/ripe`] },
    { id: 'apnic', name: 'APNIC', urls: [`${base}/blocked/apnic`, `${base}/ripe`] },
    { id: 'gone', name: 'Gone', urls: [`${base}/blocked/a`, `${base}/blocked/b`] },
  );

  try {
    const result = await rir.default.fetchCountry('IR', { family: 4, force: true });

    assert.ok(result.nets.length > 0, 'the country still resolves');
    assert.ok(result.meta.registries.includes('apnic'), 'apnic came back via its mirror');
    assert.deepEqual(
      result.meta.failedRegistries.map((f) => f.id),
      ['gone'],
      'only the registry with no working source is reported as failed',
    );
    assert.equal(result.meta.partial, true);
  } finally {
    rir.REGISTRIES.length = 0;
    rir.REGISTRIES.push(...original);
    server.close();
  }
});

test('every registry lists its own host first and at least one mirror', async () => {
  const { REGISTRIES } = await import('../src/sources/rir.js');
  assert.equal(REGISTRIES.length, 5);
  for (const registry of REGISTRIES) {
    assert.ok(registry.urls.length >= 2, `${registry.id} needs a fallback`);
    assert.ok(
      registry.urls.every((url) => url.startsWith('https://')),
      `${registry.id} must fetch over HTTPS`,
    );
    // Distinct hosts, or the "fallback" would fail with the first one.
    const hosts = new Set(registry.urls.map((url) => new URL(url).host));
    assert.equal(hosts.size, registry.urls.length, `${registry.id} repeats a host`);
  }
});
