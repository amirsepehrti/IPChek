import { countAddresses, netSize, netToRange, formatIP } from '../lib/ipnet.js';
import { header, rangeText } from './util.js';

export const plain = {
  id: 'plain',
  name: 'Plain CIDR list',
  vendor: 'Generic',
  category: 'data',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: '',
  notes:
    'One prefix per line and nothing else — the format almost every device can consume from a URL. ' +
    'pfSense URL tables, FortiGate threat feeds, PAN-OS external dynamic lists and HAProxy all read this.',
  notesFa:
    'در هر خط یک پیشوند و هیچ چیز دیگر — قالبی که تقریباً همه دستگاه‌ها می‌توانند از روی URL بخوانند.',
  render(ctx) {
    if (ctx.options?.comments === false) return ctx.prefixes.join('\n');
    return [header(ctx, '#'), ...ctx.prefixes].join('\n');
  },
};

export const ranges = {
  id: 'ranges',
  name: 'Start–end ranges',
  vendor: 'Generic',
  category: 'data',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: '',
  notes: 'First and last address of each block, for tools that want ranges instead of prefixes.',
  notesFa: 'اولین و آخرین آدرس هر بلوک، برای ابزارهایی که به‌جای CIDR بازه می‌خواهند.',
  render(ctx) {
    return [header(ctx, '#'), ...ctx.nets.map(rangeText)].join('\n');
  },
};

export const json = {
  id: 'json',
  name: 'JSON',
  vendor: 'Generic',
  category: 'data',
  extension: 'json',
  mime: 'application/json',
  families: [4, 6],
  docs: '',
  notes: 'Machine-readable output with metadata, for your own scripts and pipelines.',
  notesFa: 'خروجی ماشین‌خوان همراه با متادیتا، برای اسکریپت‌ها و خط لوله‌های خودتان.',
  render(ctx) {
    return JSON.stringify(
      {
        country: ctx.country,
        countryName: ctx.countryName,
        family: ctx.family,
        source: ctx.source,
        aggregated: ctx.aggregated,
        prefixCount: ctx.prefixes.length,
        addressCount: String(countAddresses(ctx.nets)),
        sourceFetchedAt: ctx.dataset?.sourceFetchedAt || null,
        lastChangedAt: ctx.dataset?.changedAt || null,
        generatedAt: ctx.generatedAt,
        prefixes: ctx.prefixes,
      },
      null,
      2,
    );
  },
};

export const csv = {
  id: 'csv',
  name: 'CSV',
  vendor: 'Generic',
  category: 'data',
  extension: 'csv',
  mime: 'text/csv',
  families: [4, 6],
  docs: '',
  notes: 'Spreadsheet-friendly: prefix, first address, last address and size of every block.',
  notesFa: 'مناسب اکسل: پیشوند، اولین آدرس، آخرین آدرس و اندازه هر بلوک.',
  render(ctx) {
    const rows = ['country,family,prefix,first_address,last_address,addresses'];
    for (const net of ctx.nets) {
      const range = netToRange(net);
      rows.push(
        [
          ctx.country,
          `IPv${net.version}`,
          `${formatIP(net.version, net.base)}/${net.prefix}`,
          formatIP(net.version, range.start),
          formatIP(net.version, range.end),
          netSize(net).toString(),
        ].join(','),
      );
    }
    return rows.join('\n');
  },
};
