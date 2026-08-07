#!/usr/bin/env node
/**
 * Headless companion to the web UI — useful in cron jobs and CI.
 *
 *   node src/cli.js sync IR --source=rir --family=0
 *   node src/cli.js export IR --format=mikrotik --family=4 > ir.rsc
 *   node src/cli.js monitors
 *   node src/cli.js events --limit=20
 */
import { normalizeCode, isValidCode, countryInfo } from './lib/countries.js';
import { getPrefixes, syncTarget, familiesOf } from './core/sync.js';
import { render, describeExporters } from './exporters/index.js';
import { describeSources, getSource } from './sources/index.js';
import * as store from './db/index.js';
import config from './config.js';

const argv = process.argv.slice(2);
const command = argv[0];
const positional = argv.slice(1).filter((arg) => !arg.startsWith('--'));
const flags = Object.fromEntries(
  argv
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.slice(2).split('=');
      return [key, value];
    }),
);

const die = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

function requireCountry() {
  const code = normalizeCode(positional[0]);
  if (!isValidCode(code)) die(`"${positional[0] || ''}" is not a valid ISO country code`);
  return code;
}

const USAGE = `IPChek ${config.version}

Usage:
  node src/cli.js sync <CC> [--source=rir] [--family=4|6|0] [--force]
  node src/cli.js export <CC> [--format=plain] [--source=rir] [--family=4] [--raw]
  node src/cli.js monitors
  node src/cli.js events [--limit=20] [--country=IR]
  node src/cli.js formats
  node src/cli.js sources

Default source: ${config.defaultSource}`;

switch (command) {
  case 'sync': {
    const country = requireCountry();
    const source = flags.source || config.defaultSource;
    for (const family of familiesOf(Number(flags.family ?? 4))) {
      const result = await syncTarget({
        country,
        source,
        family,
        force: flags.force === 'true',
        reason: 'cli',
      });
      console.log(
        `${country} IPv${family} via ${source}: ${result.status}` +
          (result.status === 'changed' ? ` (+${result.added} / -${result.removed})` : '') +
          (result.error ? ` — ${result.error}` : ''),
      );
    }
    break;
  }

  case 'export': {
    const country = requireCountry();
    const family = Number(flags.family ?? 4);
    const source = flags.source || config.defaultSource;
    const aggregated = flags.raw !== 'true';
    const { nets, prefixes, dataset } = await getPrefixes({ country, source, family, aggregated });
    if (!prefixes.length) die(`no data for ${country} — run "sync" first or check the source`);
    const output = render({
      format: flags.format || 'plain',
      country,
      family,
      nets,
      prefixes,
      source,
      sourceName: getSource(source).name,
      dataset,
      aggregated,
      listName: flags.list || null,
      options: { action: flags.action === 'allow' ? 'allow' : 'block' },
    });
    process.stdout.write(`${output.body}\n`);
    break;
  }

  case 'monitors': {
    const monitors = store.listMonitors();
    if (!monitors.length) console.log('no monitors configured');
    for (const monitor of monitors) {
      const info = countryInfo(monitor.country);
      console.log(
        `#${monitor.id} ${info.flag} ${monitor.country} ${info.name} · ${monitor.source} · ` +
          `IPv${monitor.family === 0 ? '4+6' : monitor.family} · ${monitor.enabled ? 'enabled' : 'paused'} · ` +
          `last check ${monitor.lastCheckedAt || 'never'}${monitor.lastStatus === 'error' ? ` · ERROR: ${monitor.lastError}` : ''}`,
      );
    }
    break;
  }

  case 'events': {
    const { events } = store.listEvents({
      limit: Number(flags.limit || 20),
      country: flags.country ? normalizeCode(flags.country) : undefined,
    });
    if (!events.length) console.log('no events recorded yet');
    for (const event of events) {
      console.log(
        `${event.detectedAt}  ${event.country} IPv${event.family}  ${event.type.padEnd(8)} ` +
          `+${event.addedCount}/-${event.removedCount}  ${event.message || ''}`,
      );
    }
    break;
  }

  case 'formats':
    for (const format of describeExporters()) {
      console.log(`${format.id.padEnd(22)} ${format.name}`);
    }
    break;

  case 'sources':
    for (const source of describeSources()) {
      console.log(`${source.id.padEnd(10)} ${source.name}${source.isDefault ? '  (default)' : ''}`);
    }
    break;

  default:
    console.log(USAGE);
    if (command && command !== 'help' && command !== '--help') process.exit(1);
}
