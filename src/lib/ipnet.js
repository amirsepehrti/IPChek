/**
 * IPv4 / IPv6 address and prefix maths.
 *
 * Addresses are handled as BigInt so that IPv4 (32 bit) and IPv6 (128 bit)
 * share one code path. A "net" is `{ version, base, prefix }` where `base` is
 * the network address as BigInt. A "range" is `{ version, start, end }`
 * inclusive on both ends.
 */

const V4_BITS = 32;
const V6_BITS = 128;

export const bitsFor = (version) => (version === 6 ? V6_BITS : V4_BITS);

/* -------------------------------------------------------------------------- */
/* parsing                                                                     */
/* -------------------------------------------------------------------------- */

/** Parse a dotted-quad IPv4 address. Returns BigInt or null. */
export function parseIPv4(input) {
  const str = String(input).trim();
  const parts = str.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    // Reject empty parts, leading zeros ("01" is ambiguous) and non-digits.
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part[0] === '0') return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

/** Parse an IPv6 address, including `::` compression and IPv4-mapped tails. */
export function parseIPv6(input) {
  let str = String(input).trim().toLowerCase();
  if (str.startsWith('[') && str.endsWith(']')) str = str.slice(1, -1);
  const zone = str.indexOf('%');
  if (zone !== -1) str = str.slice(0, zone);
  if (str === '' || str.includes(':::')) return null;

  // An embedded IPv4 tail (::ffff:192.0.2.1) becomes two hextets.
  const lastColon = str.lastIndexOf(':');
  if (str.includes('.')) {
    const tail = str.slice(lastColon + 1);
    const v4 = parseIPv4(tail);
    if (v4 === null) return null;
    const hi = (v4 >> 16n) & 0xffffn;
    const lo = v4 & 0xffffn;
    str = `${str.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = str.split('::');
  if (halves.length > 2) return null;

  const toGroups = (segment) => {
    if (segment === '') return [];
    const groups = segment.split(':');
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    }
    return groups;
  };

  const head = toGroups(halves[0]);
  if (head === null) return null;
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (tail === null) return null;

  let groups;
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // `::` must stand for at least one group
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  let value = 0n;
  for (const group of groups) value = (value << 16n) | BigInt(parseInt(group, 16));
  return value;
}

/** Parse either family. Returns `{ version, value }` or null. */
export function parseIP(input) {
  const str = String(input).trim();
  if (str.includes(':')) {
    const value = parseIPv6(str);
    return value === null ? null : { version: 6, value };
  }
  const value = parseIPv4(str);
  return value === null ? null : { version: 4, value };
}

/**
 * Parse `1.2.3.0/24`, `2001:db8::/32` or a bare address (implicit host prefix).
 * Host bits are cleared, so `1.2.3.4/24` normalises to `1.2.3.0/24`.
 * Returns a net or null.
 */
export function parseCidr(input) {
  const str = String(input).trim();
  if (!str) return null;
  const slash = str.indexOf('/');
  const addrPart = slash === -1 ? str : str.slice(0, slash);
  const ip = parseIP(addrPart);
  if (!ip) return null;

  const bits = bitsFor(ip.version);
  let prefix = bits;
  if (slash !== -1) {
    const prefixPart = str.slice(slash + 1);
    if (!/^\d{1,3}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix > bits) return null;
  }
  return { version: ip.version, base: clearHostBits(ip.value, prefix, bits), prefix };
}

function clearHostBits(value, prefix, bits) {
  const hostBits = BigInt(bits - prefix);
  if (hostBits === 0n) return value;
  return (value >> hostBits) << hostBits;
}

/* -------------------------------------------------------------------------- */
/* formatting                                                                  */
/* -------------------------------------------------------------------------- */

export function formatIPv4(value) {
  return [
    (value >> 24n) & 0xffn,
    (value >> 16n) & 0xffn,
    (value >> 8n) & 0xffn,
    value & 0xffn,
  ].join('.');
}

/** Format an IPv6 address using RFC 5952 rules (lowercase, longest `::` run). */
export function formatIPv6(value) {
  const groups = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));

  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  for (let i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (runStart === -1) runStart = i;
      const len = i - runStart + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
    }
  }

  const hex = groups.map((g) => g.toString(16));
  // A single zero group is written out; `::` is only for runs of two or more.
  if (bestLen < 2) return hex.join(':');

  const head = hex.slice(0, bestStart).join(':');
  const tail = hex.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}

export function formatIP(version, value) {
  return version === 6 ? formatIPv6(value) : formatIPv4(value);
}

export function formatCidr(net) {
  return `${formatIP(net.version, net.base)}/${net.prefix}`;
}

/** Dotted-decimal netmask for IPv4, e.g. 24 -> 255.255.255.0 */
export function netmaskV4(prefix) {
  const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(32 - prefix);
  return formatIPv4(mask);
}

/** Cisco-style wildcard (inverse) mask for IPv4, e.g. 24 -> 0.0.0.255 */
export function wildcardV4(prefix) {
  return formatIPv4((1n << BigInt(32 - prefix)) - 1n);
}

/* -------------------------------------------------------------------------- */
/* ranges                                                                      */
/* -------------------------------------------------------------------------- */

export function netToRange(net) {
  const bits = bitsFor(net.version);
  const size = 1n << BigInt(bits - net.prefix);
  return { version: net.version, start: net.base, end: net.base + size - 1n };
}

export function netSize(net) {
  return 1n << BigInt(bitsFor(net.version) - net.prefix);
}

function trailingZeros(value, max) {
  if (value === 0n) return max;
  let count = 0;
  let v = value;
  while ((v & 1n) === 0n) {
    v >>= 1n;
    count++;
  }
  return Math.min(count, max);
}

const floorLog2 = (value) => value.toString(2).length - 1;

/**
 * Split an arbitrary inclusive range into the minimal list of aligned CIDRs.
 * This is what turns RIR "start address + address count" records into prefixes.
 */
export function rangeToCidrs(version, start, end) {
  const bits = bitsFor(version);
  const out = [];
  let cursor = start;
  while (cursor <= end) {
    const alignment = trailingZeros(cursor, bits);
    const remaining = end - cursor + 1n;
    const size = Math.min(alignment, floorLog2(remaining));
    out.push({ version, base: cursor, prefix: bits - size });
    cursor += 1n << BigInt(size);
  }
  return out;
}

/** Merge a list of nets into sorted, non-overlapping ranges (adjacent ones join). */
export function mergeRanges(nets) {
  const ranges = nets.map(netToRange);
  ranges.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0));

  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1n) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function rangesToCidrs(ranges) {
  const out = [];
  for (const range of ranges) out.push(...rangeToCidrs(range.version, range.start, range.end));
  return out;
}

/**
 * Canonical form of a prefix list: overlapping and adjacent entries are merged
 * and the result is re-split into the fewest possible CIDRs. Two lists covering
 * the same address space always aggregate to the identical array.
 */
export function aggregate(nets) {
  if (nets.length === 0) return [];
  return rangesToCidrs(mergeRanges(nets));
}

/** Set difference `a \ b` over merged range lists. */
export function subtractRanges(a, b) {
  const out = [];
  let bIndex = 0;
  for (const range of a) {
    let start = range.start;
    const end = range.end;
    // Skip blocks of b that end before this range begins.
    while (bIndex < b.length && b[bIndex].end < start) bIndex++;
    let cursor = bIndex;
    while (cursor < b.length && b[cursor].start <= end) {
      const hole = b[cursor];
      if (hole.start > start) out.push({ version: range.version, start, end: hole.start - 1n });
      if (hole.end + 1n > start) start = hole.end + 1n;
      if (start > end) break;
      cursor++;
    }
    if (start <= end) out.push({ version: range.version, start, end });
  }
  return out;
}

/** Total number of addresses covered by a list of nets, as BigInt. */
export function countAddresses(nets) {
  let total = 0n;
  for (const net of nets) total += netSize(net);
  return total;
}

export function sortNets(nets) {
  return [...nets].sort((a, b) => {
    if (a.version !== b.version) return a.version - b.version;
    if (a.base !== b.base) return a.base < b.base ? -1 : 1;
    return a.prefix - b.prefix;
  });
}

/**
 * Compare two prefix lists by the address space they cover.
 * Returns CIDR strings that are newly covered and no longer covered.
 */
export function diffNets(oldNets, newNets) {
  const oldRanges = mergeRanges(oldNets);
  const newRanges = mergeRanges(newNets);
  return {
    added: rangesToCidrs(subtractRanges(newRanges, oldRanges)).map(formatCidr),
    removed: rangesToCidrs(subtractRanges(oldRanges, newRanges)).map(formatCidr),
  };
}

/* -------------------------------------------------------------------------- */
/* helpers used by the API and exporters                                       */
/* -------------------------------------------------------------------------- */

/** Parse many lines/strings into nets, skipping blanks, comments and junk. */
export function parsePrefixList(text) {
  const nets = [];
  const invalid = [];
  const lines = Array.isArray(text) ? text : String(text).split('\n');
  for (const line of lines) {
    const trimmed = String(line).split('#')[0].split(';')[0].trim();
    if (!trimmed) continue;
    const net = parseCidr(trimmed);
    if (net) nets.push(net);
    else invalid.push(trimmed);
  }
  return { nets, invalid };
}

/** True when `net` contains `addr` (`{version, value}`). */
export function netContains(net, addr) {
  if (net.version !== addr.version) return false;
  const range = netToRange(net);
  return addr.value >= range.start && addr.value <= range.end;
}

/** Human readable address count ("4.2M addresses" / "1.2K /64 subnets"). */
export function describeCount(version, total) {
  if (version === 6) {
    // IPv6 counts are astronomical; express them in /64 subnets instead.
    const subnets = total >> 64n;
    if (subnets > 0n) return `${formatCompact(subnets)} × /64`;
    return `${formatCompact(total)} addresses`;
  }
  return `${formatCompact(total)} addresses`;
}

export function formatCompact(value) {
  const units = [
    [1000000000000n, 'T'],
    [1000000000n, 'B'],
    [1000000n, 'M'],
    [1000n, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const whole = value / size;
      const fraction = ((value % size) * 10n) / size;
      return whole >= 100n ? `${whole}${suffix}` : `${whole}.${fraction}${suffix}`;
    }
  }
  return String(value);
}
