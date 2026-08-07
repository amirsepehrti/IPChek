import config from '../config.js';
import * as store from '../db/index.js';
import { syncAllMonitors, syncMonitor } from './sync.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('scheduler');

let timer = null;
let running = false;
let nextRunAt = null;

/**
 * Per-monitor intervals are honoured by checking every minute and only syncing
 * the monitors that are actually due; monitors without their own interval fall
 * back to the global one.
 */
const TICK_MS = 60000;

function isDue(monitor, now) {
  if (!monitor.enabled) return false;
  const interval = monitor.intervalMinutes || config.syncIntervalMinutes;
  if (!interval || interval <= 0) return false;
  if (!monitor.lastCheckedAt) return true;
  return now - new Date(monitor.lastCheckedAt).getTime() >= interval * 60000;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const due = store.listMonitors().filter((monitor) => isDue(monitor, now));
    if (due.length === 0) return;

    log.info(`checking ${due.length} monitor(s)`);
    for (const monitor of due) {
      try {
        await syncMonitor(monitor, { reason: 'scheduler' });
      } catch (error) {
        log.error(`monitor ${monitor.country}/${monitor.source} failed: ${error.message}`);
      }
    }
    store.setSetting('lastRun', {
      startedAt: new Date(now).toISOString(),
      finishedAt: new Date().toISOString(),
      monitors: due.length,
      reason: 'scheduler',
    });
  } finally {
    running = false;
    nextRunAt = new Date(Date.now() + TICK_MS).toISOString();
  }
}

export function startScheduler() {
  if (config.syncIntervalMinutes <= 0) {
    log.warn('automatic sync disabled (SYNC_INTERVAL_MINUTES=0)');
    return;
  }
  if (timer) return;

  timer = setInterval(() => {
    tick().catch((error) => log.error(`tick failed: ${error.message}`));
  }, TICK_MS);
  timer.unref();
  nextRunAt = new Date(Date.now() + TICK_MS).toISOString();
  log.info(`scheduler started — default interval ${config.syncIntervalMinutes} min`);

  if (config.syncOnStart) {
    const monitors = store.listMonitors().filter((m) => m.enabled);
    if (monitors.length) {
      log.info(`initial sync of ${monitors.length} monitor(s)`);
      syncAllMonitors({ reason: 'startup' }).catch((error) => log.error(`startup sync failed: ${error.message}`));
    }
  }
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function schedulerStatus() {
  return {
    enabled: config.syncIntervalMinutes > 0 && !!timer,
    running,
    intervalMinutes: config.syncIntervalMinutes,
    tickSeconds: TICK_MS / 1000,
    nextTickAt: nextRunAt,
    lastRun: store.getSetting('lastRun', null),
  };
}
