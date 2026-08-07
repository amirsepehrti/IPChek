import { fetchText } from '../lib/http.js';
import { parseIP, rangeToCidrs } from '../lib/ipnet.js';

const FILES = {
  4: 'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv4.csv',
  6: 'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv6.csv',
};

/**
 * DB-IP geolocation ranges, mirrored by sapics/ip-location-db.
 *
 * This answers a different question from the RIR data: "where is this address
 * actually used" rather than "who was it allocated to". The two disagree for
 * multinational carriers and anycast space, which is exactly why both are
 * offered — geolocation is usually what you want for traffic policy.
 */

const cache = new Map();

function parseCsv(text) {
  const index = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const first = line.indexOf(',');
    const second = line.indexOf(',', first + 1);
    if (first === -1 || second === -1) continue;

    const startIp = parseIP(line.slice(0, first));
    const endIp = parseIP(line.slice(first + 1, second));
    const code = line.slice(second + 1, second + 3).toUpperCase();
    if (!startIp || !endIp || startIp.version !== endIp.version) continue;
    if (!/^[A-Z]{2}$/.test(code)) continue;

    let entry = index.get(code);
    if (!entry) {
      entry = [];
      index.set(code, entry);
    }
    entry.push(...rangeToCidrs(startIp.version, startIp.value, endIp.value));
  }
  return index;
}

async function loadIndex(family, force) {
  const existing = cache.get(family);
  if (existing && !force && Date.now() - existing.loadedAt < 5 * 60000) return existing;

  const result = await fetchText(FILES[family], { force });
  const state = {
    index: parseCsv(result.text),
    loadedAt: Date.now(),
    fetchedAt: result.fetchedAt,
    stale: !!result.stale,
  };
  cache.set(family, state);
  return state;
}

export default {
  id: 'dbip',
  name: 'DB-IP geolocation',
  nameFa: 'موقعیت جغرافیایی DB-IP',
  description:
    'Where addresses are actually used, not who they were allocated to. Better for traffic policy; differs from RIR data.',
  descriptionFa:
    'بر اساس محل واقعی استفاده از آدرس‌ها، نه تخصیص آن‌ها. برای سیاست‌گذاری ترافیک مناسب‌تر است.',
  homepage: 'https://github.com/sapics/ip-location-db',
  license: 'CC BY 4.0 — attribution to DB-IP required',
  bulk: true,
  families: [4, 6],

  async fetchCountry(code, { family = 4, force = false } = {}) {
    const state = await loadIndex(family, force);
    return {
      nets: state.index.get(code) || [],
      meta: { source: 'dbip', url: FILES[family], fetchedAt: state.fetchedAt, stale: state.stale },
    };
  },

  async listCountries({ force = false } = {}) {
    const state = await loadIndex(4, force);
    return [...state.index.keys()].sort();
  },
};
