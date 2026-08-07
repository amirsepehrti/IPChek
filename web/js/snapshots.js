import { aggregate, diffNets, formatCidr, parseCidr } from '../src/lib/ipnet.js';

/**
 * Snapshot store for the server-free build.
 *
 * Saved lists live in this browser's localStorage, so comparison happens when
 * you open the page rather than on a schedule. That is the honest limit of a
 * static site — the self-hosted app is what checks on a timer and sends alerts.
 */

const KEY = 'ipchek.snapshots.v1';
const MAX_ENTRIES = 24;

const idOf = (country, source, family) => `${country}:${source}:${family}`;

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  // localStorage is a few megabytes; drop the oldest rather than throwing.
  const entries = Object.entries(all).sort((a, b) => (a[1].savedAt < b[1].savedAt ? 1 : -1));
  const kept = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
    return true;
  } catch {
    // Still too big: keep only the newest handful and try once more.
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(0, 5))));
      return true;
    } catch {
      return false;
    }
  }
}

export function getSnapshot(country, source, family) {
  return readAll()[idOf(country, source, family)] || null;
}

export function saveSnapshot(country, source, family, prefixes) {
  const all = readAll();
  all[idOf(country, source, family)] = {
    country,
    source,
    family,
    prefixes,
    prefixCount: prefixes.length,
    savedAt: new Date().toISOString(),
  };
  return writeAll(all);
}

export function deleteSnapshot(country, source, family) {
  const all = readAll();
  delete all[idOf(country, source, family)];
  writeAll(all);
}

export function listSnapshots() {
  return Object.values(readAll()).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/**
 * Compare a freshly fetched list against the saved one.
 * Uses the same address-space diff as the server, so a pure re-split of the
 * same ranges reports no change.
 */
export function compareWithSaved(country, source, family, currentNets) {
  const saved = getSnapshot(country, source, family);
  if (!saved) return { hasSnapshot: false };

  const savedNets = saved.prefixes.map(parseCidr).filter(Boolean);
  const diff = diffNets(aggregate(savedNets), aggregate(currentNets));

  return {
    hasSnapshot: true,
    savedAt: saved.savedAt,
    savedCount: saved.prefixCount,
    currentCount: currentNets.length,
    added: diff.added,
    removed: diff.removed,
    changed: diff.added.length > 0 || diff.removed.length > 0,
  };
}

export const toPrefixStrings = (nets) => nets.map(formatCidr);
