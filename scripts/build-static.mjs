#!/usr/bin/env node
/**
 * Assemble the static, server-free build published to GitHub Pages.
 *
 * There is no bundler: the browser loads the very same ES modules the server
 * uses, so the config it generates is byte-for-byte what the self-hosted app
 * would produce. The only job here is copying files into a layout where the
 * existing relative imports still resolve.
 *
 *   _site/index.html          web/index.html
 *   _site/css/app.css         public/css/app.css
 *   _site/js/*.js             web/js/* + the shared UI modules
 *   _site/src/lib/*.js        src/lib/*        ← imported by the exporters
 *   _site/src/exporters/*.js  src/exporters/*
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');

const COPIES = [
  ['web/index.html', 'index.html'],
  ['web/404.html', '404.html'],
  ['public/css/app.css', 'css/app.css'],
  ['web/css/static.css', 'css/static.css'],

  ['web/js/app.js', 'js/app.js'],
  ['web/js/sources.js', 'js/sources.js'],
  ['web/js/snapshots.js', 'js/snapshots.js'],
  ['web/js/strings.js', 'js/strings.js'],
  ['public/js/i18n.js', 'js/i18n.js'],
  ['public/js/spacemap.js', 'js/spacemap.js'],

  ['src/lib/ipnet.js', 'src/lib/ipnet.js'],
  ['src/lib/countries.js', 'src/lib/countries.js'],
  ['src/lib/spacemap.js', 'src/lib/spacemap.js'],

  ['src/exporters/index.js', 'src/exporters/index.js'],
  ['src/exporters/util.js', 'src/exporters/util.js'],
  ['src/exporters/network.js', 'src/exporters/network.js'],
  ['src/exporters/linux.js', 'src/exporters/linux.js'],
  ['src/exporters/server.js', 'src/exporters/server.js'],
  ['src/exporters/data.js', 'src/exporters/data.js'],

  ['docs/screenshot-overview.png', 'screenshot-overview.png'],
];

fs.rmSync(out, { recursive: true, force: true });

let copied = 0;
for (const [from, to] of COPIES) {
  const source = path.join(root, from);
  if (!fs.existsSync(source)) {
    console.error(`missing: ${from}`);
    process.exit(1);
  }
  const target = path.join(out, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  copied++;
}

// Pages serves the raw directory listing for unknown paths otherwise.
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`built _site with ${copied} files`);
