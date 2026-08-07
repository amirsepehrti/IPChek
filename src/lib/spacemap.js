/**
 * Address-space histogram.
 *
 * The whole address space is divided into 256 buckets and each bucket reports
 * the fraction of itself a country covers. IPv4 buckets are the /8 blocks, so
 * bucket 185 is 185.0.0.0/8. IPv6 buckets slice the global unicast range
 * 2000::/3, which is where every real allocation lives.
 *
 * The result is a compact fingerprint of where a country's addresses sit, and
 * it is small enough (256 numbers) to hand to a browser for every country on
 * the dashboard.
 */

export const BUCKETS = 256;

const V4_BUCKET_BITS = 24n; // 2^24 addresses per /8
const V6_BASE = 0x2000n << 112n; // 2000::
const V6_SPAN_BITS = 125n; // 2000::/3 holds 2^125 addresses
const V6_BUCKET_BITS = V6_SPAN_BITS - 8n; // divided into 256 buckets

/** Bucket index for a single address value, or -1 when out of range. */
export function bucketOf(version, value) {
  if (version === 4) return Number(value >> V4_BUCKET_BITS);
  const offset = value - V6_BASE;
  if (offset < 0n) return -1;
  const index = Number(offset >> V6_BUCKET_BITS);
  return index >= BUCKETS ? -1 : index;
}

/**
 * `number[256]`, each entry 0..1.
 *
 * IPv4 reports the fraction of the /8 a country covers, which is directly
 * comparable between countries. IPv6 reports allocation density instead,
 * normalised to the busiest bucket: a /32 is such a vanishing fraction of a
 * bucket that a coverage ratio would round every country down to a flat line,
 * while density shows the real story — which regions of the space a country
 * draws its allocations from.
 */
export function buildSpaceMap(nets, family) {
  if (family === 6) return buildDensityMap(nets);

  const covered = new Array(BUCKETS).fill(0n);
  const bucketBits = family === 6 ? V6_BUCKET_BITS : V4_BUCKET_BITS;
  const bucketSize = 1n << bucketBits;
  const base = family === 6 ? V6_BASE : 0n;

  for (const net of nets) {
    if (net.version !== family) continue;
    const size = 1n << BigInt((family === 6 ? 128 : 32) - net.prefix);
    let start = net.base;
    const end = start + size - 1n;
    if (end < base) continue;
    if (start < base) start = base;

    let index = Number((start - base) / bucketSize);
    while (index < BUCKETS) {
      const bucketStart = base + BigInt(index) * bucketSize;
      const bucketEnd = bucketStart + bucketSize - 1n;
      if (bucketStart > end) break;
      const overlap = (end < bucketEnd ? end : bucketEnd) - (start > bucketStart ? start : bucketStart) + 1n;
      if (overlap > 0n) covered[index] += overlap;
      index++;
    }
  }

  // Express each bucket as a 0..1 fraction with four decimals of resolution.
  return covered.map((amount) => {
    if (amount <= 0n) return 0;
    const scaled = Number((amount * 10000n) / bucketSize);
    return Math.min(1, scaled / 10000) || 0.0001; // keep tiny holdings visible
  });
}

function buildDensityMap(nets) {
  const counts = new Array(BUCKETS).fill(0);
  for (const net of nets) {
    if (net.version !== 6) continue;
    const index = bucketOf(6, net.base);
    if (index >= 0) counts[index]++;
  }
  const busiest = Math.max(...counts, 1);
  return counts.map((count) => (count === 0 ? 0 : Math.max(0.03, count / busiest)));
}

/** Human label for a bucket, used in tooltips. */
export function bucketLabel(index, family) {
  if (family === 6) {
    const hextet = 0x2000 + Math.floor((index * 8192) / BUCKETS);
    return `${hextet.toString(16)}00::/24 region`;
  }
  return `${index}.0.0.0/8`;
}
