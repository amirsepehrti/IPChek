import { parsePrefixList, parseIP, rangeToCidrs } from '../src/lib/ipnet.js';

/**
 * Data sources for the server-free build.
 *
 * Both are served from raw.githubusercontent.com, which sends
 * `access-control-allow-origin: *`, so the browser can fetch them directly with
 * no proxy of our own. The RIR delegation files are deliberately absent: the
 * registry FTP hosts send no CORS headers, so a page cannot read them. Anyone
 * who needs the registry files as the source runs the self-hosted app.
 */

const IPVERSE = 'https://raw.githubusercontent.com/ipverse/rir-ip/master/country';
const DBIP = 'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv';

/** Raw CSV text lives here between lookups so switching country is instant. */
const dbipCache = new Map();

async function fetchIpverse(country, family, { signal } = {}) {
  const url = `${IPVERSE}/${country.toLowerCase()}/ipv${family}-aggregated.txt`;
  const response = await fetch(url, { signal });

  // A country with no allocations in this family simply has no file.
  if (response.status === 404) return { nets: [], url, empty: true };
  if (!response.ok) throw new Error(`ipverse returned HTTP ${response.status}`);

  const { nets } = parsePrefixList(await response.text());
  return { nets, url };
}

async function fetchDbip(country, family, { signal, onProgress } = {}) {
  const url = `${DBIP}${family}.csv`;

  let text = dbipCache.get(family);
  if (!text) {
    onProgress?.('downloading');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`DB-IP returned HTTP ${response.status}`);
    text = await response.text();
    dbipCache.set(family, text);
  }

  onProgress?.('parsing');
  const code = country.toUpperCase();
  const nets = [];

  // The file covers every country; keep only the rows we were asked for rather
  // than building an index of the whole world in a tab.
  for (const line of text.split('\n')) {
    if (!line || !line.endsWith(code)) continue;
    const first = line.indexOf(',');
    const second = line.indexOf(',', first + 1);
    if (first === -1 || second === -1) continue;
    if (line.slice(second + 1).trim() !== code) continue;

    const start = parseIP(line.slice(0, first));
    const end = parseIP(line.slice(first + 1, second));
    if (!start || !end || start.version !== end.version) continue;
    nets.push(...rangeToCidrs(start.version, start.value, end.value));
  }

  return { nets, url };
}

export const SOURCES = {
  ipverse: {
    id: 'ipverse',
    name: 'ipverse RIR mirror',
    nameFa: 'آینه ipverse از داده RIR',
    weight: 'a few kilobytes',
    weightFa: 'چند کیلوبایت',
    fetch: fetchIpverse,
  },
  dbip: {
    id: 'dbip',
    name: 'DB-IP geolocation',
    nameFa: 'موقعیت جغرافیایی DB-IP',
    weight: 'about 10 MB on first use',
    weightFa: 'حدود ۱۰ مگابایت بار اول',
    fetch: fetchDbip,
  },
};

export const SOURCE_IDS = Object.keys(SOURCES);

/** Fetch one country/family, returning nets plus where they came from. */
export async function fetchRanges(country, family, sourceId, options = {}) {
  const source = SOURCES[sourceId] || SOURCES.ipverse;
  const startedAt = Date.now();
  const result = await source.fetch(country, family, options);
  return {
    ...result,
    source: source.id,
    sourceName: source.name,
    fetchedAt: new Date().toISOString(),
    tookMs: Date.now() - startedAt,
  };
}
