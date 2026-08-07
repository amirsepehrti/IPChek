import { fetchText } from '../lib/http.js';
import { parsePrefixList } from '../lib/ipnet.js';

const V4 = 'https://www.ipdeny.com/ipblocks/data/countries';
const V6 = 'https://www.ipdeny.com/ipv6/ipaddresses/aggregated';

/**
 * ipdeny.com publishes country zone files that many firewall guides reference
 * directly. Included because a lot of existing device scripts already point at
 * these URLs; the data is RIR-derived and refreshed daily.
 */
export default {
  id: 'ipdeny',
  name: 'ipdeny zone files',
  nameFa: 'فایل‌های zone سایت ipdeny',
  description: 'Classic per-country zone files, refreshed daily. Widely used by existing firewall scripts.',
  descriptionFa: 'فایل‌های کلاسیک zone برای هر کشور که روزانه به‌روز می‌شوند.',
  homepage: 'https://www.ipdeny.com/ipblocks/',
  license: 'Free for personal and commercial use',
  bulk: false,
  families: [4, 6],

  async fetchCountry(code, { family = 4, force = false } = {}) {
    const lower = code.toLowerCase();
    const url = family === 6 ? `${V6}/${lower}-aggregated.zone` : `${V4}/${lower}.zone`;
    try {
      const result = await fetchText(url, { force });
      const { nets } = parsePrefixList(result.text);
      return { nets, meta: { source: 'ipdeny', url, fetchedAt: result.fetchedAt, stale: !!result.stale } };
    } catch (error) {
      if (error.status === 404) {
        return { nets: [], meta: { source: 'ipdeny', url, fetchedAt: new Date().toISOString(), empty: true } };
      }
      throw error;
    }
  },
};
