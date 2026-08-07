import { fetchText } from '../lib/http.js';
import { parsePrefixList } from '../lib/ipnet.js';

const BASE = 'https://raw.githubusercontent.com/ipverse/rir-ip/master/country';

/**
 * ipverse/rir-ip rebuilds the RIR delegation files daily and publishes one
 * small, pre-aggregated file per country over HTTPS. Same underlying data as
 * the `rir` source, but a few kilobytes per country instead of ~35 MB total —
 * and it works on networks that block the RIR FTP hosts.
 */
export default {
  id: 'ipverse',
  name: 'ipverse RIR mirror',
  nameFa: 'آینه ipverse از داده RIR',
  description: 'Daily rebuild of the RIR delegation data, one aggregated file per country over HTTPS.',
  descriptionFa: 'بازسازی روزانه داده RIR، برای هر کشور یک فایل کوچک و تجمیع‌شده روی HTTPS.',
  homepage: 'https://github.com/ipverse/rir-ip',
  license: 'Public domain (Unlicense)',
  bulk: false,
  families: [4, 6],

  async fetchCountry(code, { family = 4, force = false } = {}) {
    const url = `${BASE}/${code.toLowerCase()}/ipv${family}-aggregated.txt`;
    try {
      const result = await fetchText(url, { force });
      const { nets } = parsePrefixList(result.text);
      return {
        nets,
        meta: { source: 'ipverse', url, fetchedAt: result.fetchedAt, stale: !!result.stale },
      };
    } catch (error) {
      // A country with no allocations in this family simply has no file.
      if (error.status === 404) {
        return { nets: [], meta: { source: 'ipverse', url, fetchedAt: new Date().toISOString(), empty: true } };
      }
      throw error;
    }
  },
};
