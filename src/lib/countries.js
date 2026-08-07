/**
 * ISO 3166-1 alpha-2 country registry.
 *
 * Country names are produced by `Intl.DisplayNames`, so they stay correct and
 * localised without shipping a translation table. Flags are derived from the
 * two-letter code via regional-indicator code points.
 */

const CONTINENTS = {
  AF: 'DZ AO BJ BW BF BI CM CV CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH YT RE SH',
  AS: 'AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KP KR KW KG LA LB MO MY MV MN MM NP OM PK PS PH QA SA SG LK SY TW TJ TH TL TR TM AE UZ VN YE IO CC CX',
  EU: 'AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA AX',
  NA: 'AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX TT TC US VI',
  SA: 'AR BO BR CL CO EC FK GF GY PY PE SR UY VE',
  OC: 'AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF UM',
  AN: 'AQ BV GS HM TF',
};

export const CONTINENT_NAMES = {
  AF: { en: 'Africa', fa: 'آفریقا' },
  AS: { en: 'Asia', fa: 'آسیا' },
  EU: { en: 'Europe', fa: 'اروپا' },
  NA: { en: 'North America', fa: 'آمریکای شمالی' },
  SA: { en: 'South America', fa: 'آمریکای جنوبی' },
  OC: { en: 'Oceania', fa: 'اقیانوسیه' },
  AN: { en: 'Antarctica', fa: 'جنوبگان' },
};

/** Countries most often put on a watch list — shown first in the UI picker. */
export const POPULAR = ['IR', 'US', 'CN', 'RU', 'DE', 'GB', 'TR', 'AE', 'NL', 'FR', 'IN', 'CA', 'JP', 'BR', 'KR'];

const CODE_TO_CONTINENT = new Map();
for (const [continent, codes] of Object.entries(CONTINENTS)) {
  for (const code of codes.split(' ')) CODE_TO_CONTINENT.set(code, continent);
}

const displayNames = {};
function namesFor(locale) {
  if (!displayNames[locale]) {
    try {
      displayNames[locale] = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' });
    } catch {
      displayNames[locale] = null;
    }
  }
  return displayNames[locale];
}

function localName(code, locale) {
  const resolver = namesFor(locale);
  if (!resolver) return code;
  try {
    return resolver.of(code) || code;
  } catch {
    return code;
  }
}

/** Turn "IR" into the 🇮🇷 flag emoji. */
export function flagOf(code) {
  if (!/^[A-Z]{2}$/.test(code)) return '🏳️';
  const base = 0x1f1e6;
  return String.fromCodePoint(base + code.charCodeAt(0) - 65, base + code.charCodeAt(1) - 65);
}

export function isValidCode(code) {
  return typeof code === 'string' && /^[A-Za-z]{2}$/.test(code) && CODE_TO_CONTINENT.has(code.toUpperCase());
}

export function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function countryInfo(code) {
  const upper = normalizeCode(code);
  return {
    code: upper,
    name: localName(upper, 'en'),
    nameFa: localName(upper, 'fa'),
    flag: flagOf(upper),
    continent: CODE_TO_CONTINENT.get(upper) || null,
  };
}

let cachedList = null;
export function allCountries() {
  if (!cachedList) {
    cachedList = [...CODE_TO_CONTINENT.keys()].map(countryInfo).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }
  return cachedList;
}

/** Free-text search over code, English name and Persian name. */
export function searchCountries(query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return allCountries();
  return allCountries().filter(
    (c) =>
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      c.nameFa.includes(term),
  );
}
