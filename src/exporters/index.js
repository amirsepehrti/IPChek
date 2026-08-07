import * as network from './network.js';
import * as linux from './linux.js';
import * as server from './server.js';
import * as data from './data.js';
import { countryInfo } from '../lib/countries.js';
import { safeName } from './util.js';

const ORDER = [
  network.mikrotik,
  network.mikrotikAutoUpdate,
  network.fortigate,
  network.fortigateThreatFeed,
  network.ciscoAsa,
  network.ciscoIos,
  network.ciscoIosAcl,
  network.juniper,
  network.paloalto,
  network.huawei,
  network.vyos,
  network.pfsense,
  linux.iptables,
  linux.ipset,
  linux.nftables,
  linux.windowsNetsh,
  linux.powershell,
  server.nginxGeo,
  server.nginxDeny,
  server.haproxy,
  server.apache,
  server.squid,
  data.plain,
  data.ranges,
  data.json,
  data.csv,
];

export const EXPORTERS = new Map(ORDER.map((exporter) => [exporter.id, exporter]));

export const CATEGORIES = {
  router: { en: 'Routers', fa: 'روترها' },
  firewall: { en: 'Firewalls', fa: 'فایروال‌ها' },
  linux: { en: 'Linux / open source', fa: 'لینوکس و متن‌باز' },
  windows: { en: 'Windows', fa: 'ویندوز' },
  server: { en: 'Web servers & proxies', fa: 'وب‌سرورها و پراکسی‌ها' },
  data: { en: 'Raw data', fa: 'داده خام' },
};

export function getExporter(id) {
  const exporter = EXPORTERS.get(String(id || 'plain').toLowerCase());
  if (!exporter) {
    throw Object.assign(new Error(`unknown format "${id}" (available: ${[...EXPORTERS.keys()].join(', ')})`), {
      status: 400,
    });
  }
  return exporter;
}

export function describeExporters() {
  return ORDER.map((exporter) => ({
    id: exporter.id,
    name: exporter.name,
    vendor: exporter.vendor,
    category: exporter.category,
    categoryLabel: CATEGORIES[exporter.category],
    extension: exporter.extension,
    families: exporter.families,
    docs: exporter.docs,
    notes: exporter.notes,
    notesFa: exporter.notesFa,
  }));
}

/**
 * Render a prefix list in a device format.
 *
 * `nets` and `prefixes` describe the same data; exporters that need masks or
 * ranges use `nets`, the rest just join `prefixes`.
 *
 * This module deliberately depends only on `lib/ipnet` and `lib/countries`,
 * both of which are pure. That keeps the whole exporter layer isomorphic, so
 * the static browser build renders exactly the same config as the server.
 */
export function render({
  format,
  country,
  family,
  nets,
  prefixes,
  source,
  sourceName = null,
  dataset = null,
  aggregated = true,
  listName = null,
  options = {},
  selfUrl = null,
}) {
  const exporter = getExporter(format);
  if (!exporter.families.includes(family)) {
    throw Object.assign(new Error(`format "${exporter.id}" does not support IPv${family}`), { status: 400 });
  }

  const info = countryInfo(country);
  const ctx = {
    country: info.code,
    countryName: info.name,
    countryNameFa: info.nameFa,
    flag: info.flag,
    family,
    nets,
    prefixes,
    source,
    sourceName: sourceName || source,
    dataset,
    aggregated,
    listName: listName || `${info.code}-v${family}`,
    options,
    selfUrl,
    generatedAt: new Date().toISOString(),
  };

  return {
    body: exporter.render(ctx),
    mime: exporter.mime,
    filename: `ipchek-${safeName(ctx.listName).toLowerCase()}-${exporter.id}.${exporter.extension}`,
    exporter: { id: exporter.id, name: exporter.name, notes: exporter.notes, notesFa: exporter.notesFa, docs: exporter.docs },
  };
}
