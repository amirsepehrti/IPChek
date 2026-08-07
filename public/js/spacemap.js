/**
 * The address-space map.
 *
 * 256 columns spanning the whole address space. For IPv4 each column is one /8
 * — column 185 is 185.0.0.0/8 — so a country's holdings draw a fingerprint you
 * can recognise at a glance. Change events overlay ticks in place, which shows
 * not just that ranges moved but *where* in the space they moved.
 */

const WIDTH = 256;
const HEIGHT = 46;
const FLOOR = 2;

/** Bucket index for a CIDR string, matching the server's bucketing. */
export function bucketOfPrefix(prefix, family) {
  if (family === 6) {
    const head = parseInt(prefix.split(':')[0] || '0', 16);
    if (!Number.isFinite(head) || head < 0x2000 || head > 0x3fff) return -1;
    return Math.min(WIDTH - 1, Math.floor(((head - 0x2000) * WIDTH) / 0x2000));
  }
  const octet = Number(prefix.split('.')[0]);
  return Number.isFinite(octet) ? Math.min(WIDTH - 1, Math.max(0, octet)) : -1;
}

const svgEscape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Render the map as inline SVG.
 * `buckets` is the 256-entry 0..1 coverage array from /api/spacemap.
 */
export function renderSpaceMap(buckets, family, { added = [], removed = [], height = HEIGHT } = {}) {
  const bars = [];

  for (let i = 0; i < WIDTH; i++) {
    const value = buckets?.[i] || 0;
    if (value <= 0) continue;
    // Strong gamma so a single /24 in a /8 is still visible next to a full /8.
    const barHeight = FLOOR + (height - FLOOR - 6) * Math.pow(value, 0.32);
    bars.push(`<rect class="bar" x="${i}" y="${(height - 6 - barHeight).toFixed(2)}" width="0.86" height="${barHeight.toFixed(2)}"/>`);
  }

  const ticks = [];
  const seenAdd = new Set();
  for (const prefix of added) {
    const index = bucketOfPrefix(prefix, family);
    if (index >= 0 && !seenAdd.has(index)) {
      seenAdd.add(index);
      ticks.push(`<rect class="tick-add" x="${index}" y="${height - 5}" width="1.7" height="5"/>`);
    }
  }
  const seenDel = new Set();
  for (const prefix of removed) {
    const index = bucketOfPrefix(prefix, family);
    if (index >= 0 && !seenDel.has(index)) {
      seenDel.add(index);
      ticks.push(`<rect class="tick-del" x="${index}" y="0" width="1.7" height="5"/>`);
    }
  }

  return (
    `<svg class="spacemap ${family === 6 ? 'v6' : 'v4'}" viewBox="0 0 ${WIDTH} ${height}" ` +
    `preserveAspectRatio="none" role="img" aria-label="${svgEscape(
      family === 6 ? 'IPv6 address space coverage' : 'IPv4 address space coverage',
    )}">` +
    `<rect class="base" x="0" y="${height - 6}" width="${WIDTH}" height="0.6"/>` +
    bars.join('') +
    ticks.join('') +
    '</svg>'
  );
}

/** Axis labels under the map. */
export function spaceMapAxis(family) {
  return family === 6
    ? '<div class="spacemap-axis"><span>2000::</span><span>2800::</span><span>3000::</span><span>3fff::</span></div>'
    : '<div class="spacemap-axis"><span>0.0.0.0</span><span>64.0.0.0</span><span>128.0.0.0</span><span>192.0.0.0</span><span>255.0.0.0</span></div>';
}
