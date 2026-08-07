import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate,
  countAddresses,
  describeCount,
  describeCountParts,
  diffNets,
  formatCidr,
  formatCompact,
  formatIPv6,
  netmaskV4,
  parseCidr,
  parseIP,
  parseIPv4,
  parseIPv6,
  parsePrefixList,
  rangeToCidrs,
  subtractRanges,
  mergeRanges,
  wildcardV4,
} from '../src/lib/ipnet.js';

const cidrs = (list) => list.map(parseCidr);
const strings = (nets) => nets.map(formatCidr);

test('parses IPv4 and rejects malformed input', () => {
  assert.equal(parseIPv4('192.0.2.1'), 3221225985n);
  assert.equal(parseIPv4('0.0.0.0'), 0n);
  assert.equal(parseIPv4('255.255.255.255'), 4294967295n);

  for (const bad of ['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', 'a.b.c.d', '', '1.2.3.-1']) {
    assert.equal(parseIPv4(bad), null, `expected ${bad} to be rejected`);
  }
});

test('parses IPv6 including compression and IPv4 tails', () => {
  assert.equal(formatIPv6(parseIPv6('::')), '::');
  assert.equal(formatIPv6(parseIPv6('::1')), '::1');
  assert.equal(formatIPv6(parseIPv6('2001:0db8:0000:0000:0000:ff00:0042:8329')), '2001:db8::ff00:42:8329');
  assert.equal(formatIPv6(parseIPv6('fe80::1%eth0')), 'fe80::1');
  assert.equal(formatIPv6(parseIPv6('[2001:db8::1]')), '2001:db8::1');
  // A single zero group is written out, never compressed to "::".
  assert.equal(formatIPv6(parseIPv6('2001:db8:0:1:1:1:1:1')), '2001:db8:0:1:1:1:1:1');
  assert.equal(parseIPv6('::ffff:192.0.2.128'), parseIPv6('::ffff:c000:280'));

  for (const bad of ['2001:db8:::1', '12345::', '1:2:3:4:5:6:7', '::1::2', 'gggg::']) {
    assert.equal(parseIPv6(bad), null, `expected ${bad} to be rejected`);
  }
});

test('parseCidr clears host bits and validates the prefix length', () => {
  assert.equal(formatCidr(parseCidr('192.0.2.130/24')), '192.0.2.0/24');
  assert.equal(formatCidr(parseCidr('2001:db8::dead:beef/32')), '2001:db8::/32');
  assert.equal(formatCidr(parseCidr('10.1.2.3')), '10.1.2.3/32');
  assert.equal(parseCidr('10.0.0.0/33'), null);
  assert.equal(parseCidr('2001:db8::/129'), null);
  assert.equal(parseCidr('not-an-ip/24'), null);
});

test('rangeToCidrs splits arbitrary ranges into aligned blocks', () => {
  const start = parseIP('1.0.0.0').value;
  assert.deepEqual(strings(rangeToCidrs(4, start, start + 299n)), [
    '1.0.0.0/24',
    '1.0.1.0/27',
    '1.0.1.32/29',
    '1.0.1.40/30',
  ]);

  // The whole space collapses to a single /0 without overflowing.
  assert.deepEqual(strings(rangeToCidrs(4, 0n, 4294967295n)), ['0.0.0.0/0']);

  // A single address is a /32.
  assert.deepEqual(strings(rangeToCidrs(4, start, start)), ['1.0.0.0/32']);

  // Ranges reassemble to exactly the same address count they started with.
  const total = countAddresses(rangeToCidrs(4, start + 7n, start + 1000n));
  assert.equal(total, 994n);
});

test('aggregate merges overlapping, contained and adjacent blocks', () => {
  assert.deepEqual(strings(aggregate(cidrs(['10.0.0.0/24', '10.0.1.0/24']))), ['10.0.0.0/23']);
  assert.deepEqual(strings(aggregate(cidrs(['10.0.0.0/24', '10.0.0.128/25']))), ['10.0.0.0/24']);
  assert.deepEqual(strings(aggregate(cidrs(['10.0.1.0/24', '10.0.0.0/24']))), ['10.0.0.0/23']);
  assert.deepEqual(strings(aggregate(cidrs(['10.0.0.0/24', '10.0.2.0/24']))), ['10.0.0.0/24', '10.0.2.0/24']);
  assert.deepEqual(aggregate([]), []);

  // Aggregation never changes how many addresses are covered.
  const input = cidrs(['1.0.0.0/24', '1.0.1.0/24', '5.5.5.5/32']);
  assert.equal(countAddresses(aggregate(input)), countAddresses(input));
});

test('subtractRanges computes a true set difference', () => {
  const a = mergeRanges(cidrs(['10.0.0.0/16']));
  const b = mergeRanges(cidrs(['10.0.5.0/24']));
  const remaining = subtractRanges(a, b);
  assert.equal(remaining.length, 2);
  assert.equal(countAddresses(cidrs(['10.0.0.0/16'])) - 256n, remaining.reduce((sum, r) => sum + (r.end - r.start + 1n), 0n));

  // Subtracting everything leaves nothing.
  assert.deepEqual(subtractRanges(a, mergeRanges(cidrs(['10.0.0.0/8']))), []);
  // Subtracting a disjoint set changes nothing.
  assert.equal(subtractRanges(a, mergeRanges(cidrs(['192.168.0.0/16']))).length, 1);
});

test('diffNets reports address space, not prefix bookkeeping', () => {
  const before = cidrs(['1.0.0.0/24', '2.0.0.0/24']);
  const after = cidrs(['1.0.0.0/23', '3.0.0.0/24']);
  const diff = diffNets(before, after);
  assert.deepEqual(diff.added, ['1.0.1.0/24', '3.0.0.0/24']);
  assert.deepEqual(diff.removed, ['2.0.0.0/24']);
});

test('diffNets ignores a pure re-split of the same space', () => {
  // This is the case that would otherwise fire a false alarm every time a
  // registry publishes the same allocations with different aggregation.
  const diff = diffNets(cidrs(['1.0.0.0/23']), cidrs(['1.0.0.0/24', '1.0.1.0/24']));
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
});

test('diffNets handles a first-time list and a full withdrawal', () => {
  assert.deepEqual(diffNets([], cidrs(['1.0.0.0/24'])), { added: ['1.0.0.0/24'], removed: [] });
  assert.deepEqual(diffNets(cidrs(['1.0.0.0/24']), []), { added: [], removed: ['1.0.0.0/24'] });
});

test('IPv6 diffs work at v6 scale', () => {
  const diff = diffNets(cidrs(['2001:db8::/32']), cidrs(['2001:db8::/32', '2a00:1450::/32']));
  assert.deepEqual(diff.added, ['2a00:1450::/32']);
  assert.deepEqual(diff.removed, []);
});

test('masks are correct at the boundaries', () => {
  assert.equal(netmaskV4(0), '0.0.0.0');
  assert.equal(netmaskV4(24), '255.255.255.0');
  assert.equal(netmaskV4(32), '255.255.255.255');
  assert.equal(wildcardV4(24), '0.0.0.255');
  assert.equal(wildcardV4(32), '0.0.0.0');
  assert.equal(wildcardV4(0), '255.255.255.255');
});

test('parsePrefixList skips comments, blanks and junk', () => {
  const { nets, invalid } = parsePrefixList(`
    # a comment
    1.0.0.0/24
    ; another comment
    2001:db8::/32   # trailing comment

    garbage-line
  `);
  assert.deepEqual(strings(nets), ['1.0.0.0/24', '2001:db8::/32']);
  assert.deepEqual(invalid, ['garbage-line']);
});

test('counts are humanised without losing precision', () => {
  assert.equal(countAddresses(cidrs(['1.0.0.0/24', '2.0.0.0/24'])), 512n);
  assert.equal(formatCompact(999n), '999');
  assert.equal(formatCompact(1500n), '1.5K');
  assert.equal(formatCompact(10831872n), '10.8M');
  assert.equal(describeCount(4, 10831872n), '10.8M addresses');
  // IPv6 totals are expressed in /64 subnets, which is the unit people use.
  assert.match(describeCount(6, countAddresses(cidrs(['2001:db8::/32']))), /\/64$/);
});

test('address counts carry the unit they are counted in', () => {
  assert.deepEqual(describeCountParts(4, 10831872n), { value: '10.8M', unit: 'addresses' });
  // A v6 total large enough to hold /64s is reported in /64s, not addresses.
  const v6 = countAddresses(cidrs(['2001:db8::/32']));
  assert.deepEqual(describeCountParts(6, v6), { value: '4.2B', unit: 'subnets64' });
  assert.equal(describeCount(6, v6), '4.2B × /64');
  // A v6 range smaller than one /64 falls back to counting addresses.
  assert.deepEqual(describeCountParts(6, countAddresses(cidrs(['2001:db8::/120']))), {
    value: '256',
    unit: 'addresses',
  });
});
