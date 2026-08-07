import { fetchText } from '../lib/http.js';
import { parseIPv4, parseIPv6, rangeToCidrs } from '../lib/ipnet.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('source:rir');

/**
 * The five Regional Internet Registries publish a daily "delegated extended"
 * statistics file. This is the authoritative record of which organisation in
 * which country an address block was allocated to.
 *
 * Each registry is listed with its own host first and mirrors after it. The
 * registries carry each other's files, which matters more than it sounds: a
 * network that cannot reach ftp.apnic.net can very often still reach
 * ftp.ripe.net, and APNIC's file is byte-for-byte the same from either. Without
 * the fallbacks, one blocked host makes the whole source unusable.
 */
export const REGISTRIES = [
  {
    id: 'ripencc',
    name: 'RIPE NCC',
    urls: [
      'https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest',
      'https://ftp.arin.net/pub/stats/ripencc/delegated-ripencc-extended-latest',
      'https://ftp.apnic.net/stats/ripencc/delegated-ripencc-extended-latest',
    ],
  },
  {
    id: 'arin',
    name: 'ARIN',
    urls: [
      'https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest',
      'https://ftp.ripe.net/pub/stats/arin/delegated-arin-extended-latest',
      'https://ftp.apnic.net/stats/arin/delegated-arin-extended-latest',
    ],
  },
  {
    id: 'apnic',
    name: 'APNIC',
    urls: [
      'https://ftp.apnic.net/stats/apnic/delegated-apnic-extended-latest',
      'https://ftp.ripe.net/pub/stats/apnic/delegated-apnic-extended-latest',
      'https://ftp.arin.net/pub/stats/apnic/delegated-apnic-extended-latest',
    ],
  },
  {
    id: 'afrinic',
    name: 'AFRINIC',
    urls: [
      'https://ftp.afrinic.net/pub/stats/afrinic/delegated-afrinic-extended-latest',
      'https://ftp.ripe.net/pub/stats/afrinic/delegated-afrinic-extended-latest',
      'https://ftp.arin.net/pub/stats/afrinic/delegated-afrinic-extended-latest',
    ],
  },
  {
    id: 'lacnic',
    name: 'LACNIC',
    urls: [
      'https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest',
      'https://ftp.ripe.net/pub/stats/lacnic/delegated-lacnic-extended-latest',
      'https://ftp.arin.net/pub/stats/lacnic/delegated-lacnic-extended-latest',
    ],
  },
];

/**
 * Fetch one registry's file, falling back through its mirrors.
 *
 * Each candidate gets one quick attempt rather than the usual retry ladder: a
 * blocked host should cost seconds before moving to the next mirror, not
 * minutes. The last candidate keeps a retry so a single flaky response does not
 * write the registry off.
 */
async function fetchRegistry(registry, force) {
  const attempts = [];

  for (let i = 0; i < registry.urls.length; i++) {
    const url = registry.urls[i];
    const isLast = i === registry.urls.length - 1;
    try {
      const result = await fetchText(url, { force, retries: isLast ? 1 : 0, timeoutMs: 90000 });
      if (i > 0) log.info(`${registry.id}: served from mirror ${url}`);
      return { ...result, url, viaMirror: i > 0 };
    } catch (error) {
      attempts.push(`${url}: ${error.message}`);
      if (!isLast) log.debug(`${registry.id}: ${url} unavailable, trying the next mirror`);
    }
  }

  throw new Error(`all ${registry.urls.length} sources failed — ${attempts.join(' | ')}`);
}

const USABLE_STATUS = new Set(['allocated', 'assigned']);

/** Parse one delegated-extended file into `Map<CC, { 4: nets[], 6: nets[] }>`. */
export function parseDelegatedFile(text, index = new Map()) {
  let records = 0;
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const fields = line.split('|');
    if (fields.length < 7) continue;

    const [, cc, type, start, value, , status] = fields;
    if (!cc || cc === '*' || cc.length !== 2) continue; // header and summary rows
    if (type !== 'ipv4' && type !== 'ipv6') continue;
    if (!USABLE_STATUS.has(status)) continue;

    const code = cc.toUpperCase();
    let entry = index.get(code);
    if (!entry) {
      entry = { 4: [], 6: [] };
      index.set(code, entry);
    }

    if (type === 'ipv4') {
      const base = parseIPv4(start);
      const count = Number(value);
      if (base === null || !Number.isFinite(count) || count <= 0) continue;
      // `value` is an address count, not a prefix length, and is not always a
      // power of two — split the range into aligned CIDRs.
      entry[4].push(...rangeToCidrs(4, base, base + BigInt(count) - 1n));
    } else {
      const base = parseIPv6(start);
      const prefix = Number(value);
      if (base === null || !Number.isFinite(prefix) || prefix < 0 || prefix > 128) continue;
      entry[6].push({ version: 6, base, prefix });
    }
    records++;
  }
  return { index, records };
}

let cache = null;

async function loadIndex({ force = false } = {}) {
  if (cache && !force && Date.now() - cache.loadedAt < 5 * 60000) return cache;

  const index = new Map();
  const loaded = [];
  const failed = [];
  let oldestFetch = null;

  const results = await Promise.allSettled(
    REGISTRIES.map(async (registry) => ({ registry, result: await fetchRegistry(registry, force) })),
  );

  for (let i = 0; i < results.length; i++) {
    const outcome = results[i];
    if (outcome.status === 'rejected') {
      failed.push({ id: REGISTRIES[i].id, error: String(outcome.reason?.message || outcome.reason) });
      log.warn(`${REGISTRIES[i].id} unavailable from every mirror: ${outcome.reason?.message}`);
      continue;
    }
    const { registry, result } = outcome.value;
    const { records } = parseDelegatedFile(result.text, index);
    loaded.push({
      id: registry.id,
      name: registry.name,
      records,
      fetchedAt: result.fetchedAt,
      stale: !!result.stale,
      url: result.url,
      viaMirror: !!result.viaMirror,
    });
    if (!oldestFetch || result.fetchedAt < oldestFetch) oldestFetch = result.fetchedAt;
  }

  if (loaded.length === 0) {
    const detail = failed.map((f) => `${f.id}: ${f.error}`).join('; ');
    throw new Error(
      `no RIR registry could be reached, including every mirror (${detail}). If your network blocks ` +
        'these hosts, switch the source to "ipverse" which mirrors the same data over HTTPS from GitHub.',
    );
  }

  const mirrored = loaded.filter((r) => r.viaMirror).map((r) => r.id);
  if (mirrored.length) log.info(`served from a mirror: ${mirrored.join(', ')}`);

  cache = {
    index,
    loadedAt: Date.now(),
    loaded,
    failed,
    fetchedAt: oldestFetch,
    partial: failed.length > 0,
  };
  return cache;
}

export default {
  id: 'rir',
  name: 'RIR delegation files',
  nameFa: 'فایل‌های تخصیص RIR',
  description:
    'Official daily statistics from RIPE NCC, ARIN, APNIC, AFRINIC and LACNIC. Authoritative allocation data.',
  descriptionFa:
    'آمار رسمی روزانه پنج ریجیستری اینترنتی. مرجع اصلی تخصیص آدرس‌ها به هر کشور.',
  homepage: 'https://www.nro.net/about/rirs/statistics/',
  license: 'Public statistics, free to use',
  bulk: true,
  families: [4, 6],

  async fetchCountry(code, { family = 4, force = false } = {}) {
    const state = await loadIndex({ force });
    const entry = state.index.get(code);
    return {
      nets: entry ? entry[family] : [],
      meta: {
        source: 'rir',
        fetchedAt: state.fetchedAt,
        partial: state.partial,
        registries: state.loaded.map((r) => r.id),
        failedRegistries: state.failed,
        stale: state.loaded.some((r) => r.stale),
      },
    };
  },

  async listCountries({ force = false } = {}) {
    const state = await loadIndex({ force });
    return [...state.index.keys()].sort();
  },
};
