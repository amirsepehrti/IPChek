#!/usr/bin/env node
/**
 * Guard for the bundler-free static build.
 *
 * Because nothing links the modules together, a missing file in the copy list
 * only shows up as a blank page in the browser. This walks every import in
 * `_site` and fails the build if one does not resolve, and checks that the
 * page references only files that were actually published.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');

if (!fs.existsSync(site)) {
  console.error('_site does not exist — run scripts/build-static.mjs first');
  process.exit(1);
}

const problems = [];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(site);
const jsFiles = files.filter((file) => file.endsWith('.js'));

// Every relative import must land on a file that exists.
const IMPORT = /(?:^|\s)(?:import|export)[\s\S]*?from\s+['"](\.[^'"]+)['"]/g;
let checked = 0;

for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(IMPORT)) {
    const target = path.resolve(path.dirname(file), match[1]);
    checked++;
    if (!fs.existsSync(target)) {
      problems.push(`${path.relative(site, file)} imports ${match[1]} which is not in the build`);
    }
  }
}

// Nothing may reach outside the published directory.
for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(IMPORT)) {
    const target = path.resolve(path.dirname(file), match[1]);
    if (!target.startsWith(site)) {
      problems.push(`${path.relative(site, file)} imports ${match[1]} from outside the build`);
    }
  }
}

// Assets referenced by the page must be published too.
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)) {
  const target = path.resolve(site, match[1]);
  if (!fs.existsSync(target)) problems.push(`index.html references ${match[1]} which is not in the build`);
}

if (problems.length) {
  console.error('static build is broken:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`static build OK — ${jsFiles.length} modules, ${checked} imports resolved`);
