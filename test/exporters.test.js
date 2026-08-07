import test from 'node:test';
import assert from 'node:assert/strict';
import { describeExporters, getExporter, render } from '../src/exporters/index.js';
import { formatCidr, parseCidr } from '../src/lib/ipnet.js';

const V4 = ['2.144.0.0/14', '5.22.0.0/17', '185.1.2.0/24'].map(parseCidr);
const V6 = ['2001:678:b0::/46', '2a00:1450::/32'].map(parseCidr);

const build = (format, family = 4, extra = {}) =>
  render({
    format,
    country: 'IR',
    family,
    nets: family === 6 ? V6 : V4,
    prefixes: (family === 6 ? V6 : V4).map(formatCidr),
    source: 'ipverse',
    aggregated: true,
    ...extra,
  });

test('every format renders for every family it claims to support', () => {
  const formats = describeExporters();
  assert.ok(formats.length >= 20, 'expected a broad format catalogue');

  for (const format of formats) {
    for (const family of format.families) {
      const output = build(format.id, family);
      assert.ok(output.body.length > 20, `${format.id}/v${family} produced no output`);
      assert.ok(output.filename.endsWith(`.${format.extension}`), `${format.id} filename extension mismatch`);
      assert.ok(output.mime, `${format.id} has no mime type`);
    }
  }
});

test('every format includes all of the prefixes it was given', () => {
  // Formats that intentionally rewrite the prefix (masks, ranges) or point at
  // a URL instead of listing prefixes are checked separately below.
  const literal = ['mikrotik', 'cisco-ios', 'juniper', 'paloalto', 'vyos', 'pfsense', 'plain', 'json', 'nginx-geo',
    'nginx-deny', 'haproxy', 'apache', 'squid', 'iptables', 'ipset', 'nftables', 'powershell'];
  for (const id of literal) {
    const body = build(id).body;
    for (const prefix of V4.map(formatCidr)) {
      assert.ok(body.includes(prefix), `${id} is missing ${prefix}`);
    }
  }
});

test('formats reject a family they do not support', () => {
  const exporter = getExporter('mikrotik');
  assert.deepEqual(exporter.families, [4, 6]);
  assert.throws(() => render({ format: 'mikrotik', country: 'IR', family: 5, nets: [], prefixes: [], source: 'rir' }),
    /does not support/);
});

test('unknown formats fail loudly with the list of valid ones', () => {
  assert.throws(() => getExporter('definitely-not-a-router'), /unknown format/);
});

test('MikroTik output clears the list before refilling it', () => {
  const body = build('mikrotik').body;
  assert.ok(body.includes('/ip firewall address-list'));
  assert.ok(body.includes('remove [find list="IR-v4"]'));
  assert.ok(body.indexOf('remove [find') < body.indexOf('add list='), 'remove must come before the adds');
  assert.ok(build('mikrotik', 6).body.includes('/ipv6 firewall address-list'));
});

test('FortiGate converts IPv4 prefixes to address/mask pairs and chunks groups', () => {
  const body = build('fortigate').body;
  assert.ok(body.includes('set subnet 2.144.0.0 255.252.0.0'));
  assert.ok(body.includes('config firewall addrgrp'));
  assert.ok(build('fortigate', 6).body.includes('set ip6 2001:678:b0::/46'));

  // A list past the per-group limit is split and re-collected under one parent.
  const many = Array.from({ length: 700 }, (_, i) => parseCidr(`10.${Math.floor(i / 256)}.${i % 256}.0/24`));
  const big = render({ format: 'fortigate', country: 'IR', family: 4, nets: many,
    prefixes: many.map(formatCidr), source: 'rir', aggregated: false });
  assert.ok(big.body.includes('IR-v4_g1'));
  assert.ok(big.body.includes('IR-v4_g3'));
  assert.ok(big.body.includes('edit "IR-v4"'), 'expected a parent group collecting the batches');
});

test('Cisco IOS ACL emits correct wildcard masks', () => {
  const body = build('cisco-ios-acl').body;
  assert.ok(body.includes('deny ip 2.144.0.0 0.3.255.255 any'));
  assert.ok(body.includes('deny ip 185.1.2.0 0.0.0.255 any'));
  assert.ok(body.trimEnd().endsWith('permit ip any any'));
});

test('the action option flips block and allow semantics', () => {
  assert.ok(build('iptables', 4, { options: { action: 'block' } }).body.includes('-j DROP'));
  assert.ok(build('iptables', 4, { options: { action: 'allow' } }).body.includes('-j ACCEPT'));
  assert.ok(build('nginx-deny', 4, { options: { action: 'block' } }).body.includes('deny 2.144.0.0/14;'));

  const allow = build('nginx-deny', 4, { options: { action: 'allow' } }).body;
  assert.ok(allow.includes('allow 2.144.0.0/14;'));
  assert.ok(allow.trimEnd().endsWith('deny all;'), 'an allow-list must close with a default deny');
});

test('ipset sizes the hash for the list it is given', () => {
  const body = build('ipset').body;
  const [, hashsize] = body.match(/hashsize (\d+)/);
  assert.equal(Number(hashsize) & (Number(hashsize) - 1), 0, 'hashsize must be a power of two');
  assert.ok(body.includes('flush IR-v4'), 'a reload must not append to stale entries');
  assert.ok(build('ipset', 6).body.includes('family inet6'));
});

test('nftables picks the right address type per family', () => {
  assert.ok(build('nftables').body.includes('type ipv4_addr'));
  assert.ok(build('nftables').body.includes('flags interval'));
  assert.ok(build('nftables', 6).body.includes('type ipv6_addr'));
  assert.ok(build('nftables', 6).body.includes('ip6 saddr'));
});

test('Windows netsh splits prefixes across rules to stay under the argument limit', () => {
  const many = Array.from({ length: 450 }, (_, i) => parseCidr(`10.${Math.floor(i / 256)}.${i % 256}.0/24`));
  const body = render({ format: 'windows-netsh', country: 'IR', family: 4, nets: many,
    prefixes: many.map(formatCidr), source: 'rir' }).body;
  const rules = body.match(/add rule/g) || [];
  assert.equal(rules.length, 3, 'expected 450 prefixes to be split into 3 rules of 200');
  assert.ok(body.includes('delete rule'), 'each rule must be replaced, not duplicated');
});

test('self-updating formats embed the live URL when one is known', () => {
  const url = 'http://ipchek.lan:8080/api/export/IR?family=4&format=mikrotik-autoupdate';
  const body = build('mikrotik-autoupdate', 4, { selfUrl: url }).body;
  assert.ok(body.includes('format=mikrotik'), 'the script must fetch a RouterOS script, not itself');
  assert.ok(body.includes('/system scheduler add'));

  const feed = build('fortigate-threatfeed', 4, { selfUrl: url }).body;
  assert.ok(feed.includes('format=plain'), 'a threat feed must point at the plain list');
  assert.ok(feed.includes('config system external-resource'));
});

test('JSON output is machine readable and complete', () => {
  const parsed = JSON.parse(build('json').body);
  assert.equal(parsed.country, 'IR');
  assert.equal(parsed.family, 4);
  assert.equal(parsed.prefixCount, 3);
  assert.deepEqual(parsed.prefixes, V4.map(formatCidr));
  assert.equal(typeof parsed.addressCount, 'string');
});

test('CSV includes a header and the first and last address of each block', () => {
  const rows = build('csv').body.split('\n');
  assert.equal(rows[0], 'country,family,prefix,first_address,last_address,addresses');
  assert.equal(rows[1], 'IR,IPv4,2.144.0.0/14,2.144.0.0,2.147.255.255,262144');
});

test('list names are sanitised for device object naming rules', () => {
  const body = build('nftables', 4, { listName: 'IR v4; drop table' }).body;
  assert.ok(!body.includes('IR v4; drop table'));
  assert.ok(/set IR_v4__drop_table/.test(body));
});

test('device notes are available in both languages', () => {
  for (const format of describeExporters()) {
    assert.ok(format.notes && format.notes.length > 10, `${format.id} is missing English notes`);
    assert.ok(format.notesFa && format.notesFa.length > 5, `${format.id} is missing Persian notes`);
  }
});
