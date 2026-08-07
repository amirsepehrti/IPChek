import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('http');

const USER_AGENT = `IPChek/${config.version} (+https://github.com/amirsepehrti/IPChek)`;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cacheKeyFor = (url) => crypto.createHash('sha1').update(url).digest('hex');

function cachePaths(url) {
  const key = cacheKeyFor(url);
  return {
    body: path.join(config.cacheDir, `${key}.body`),
    meta: path.join(config.cacheDir, `${key}.json`),
  };
}

function readCache(url) {
  const paths = cachePaths(url);
  if (!fs.existsSync(paths.body) || !fs.existsSync(paths.meta)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8'));
    return { meta, read: () => fs.readFileSync(paths.body, 'utf8') };
  } catch {
    return null;
  }
}

function writeCache(url, text, meta) {
  const paths = cachePaths(url);
  fs.writeFileSync(paths.body, text);
  fs.writeFileSync(paths.meta, JSON.stringify({ url, ...meta }, null, 2));
}

/**
 * Fetch a text resource with retries, a disk cache and conditional requests.
 *
 * Source files are large (the RIR delegation files are tens of megabytes) and
 * shared between countries, so a single download serves every country in a
 * sync run and survives restarts.
 */
export async function fetchText(url, options = {}) {
  const {
    cacheMinutes = config.sourceCacheMinutes,
    timeoutMs = 120000,
    retries = 3,
    force = false,
  } = options;

  const cached = readCache(url);
  const now = Date.now();

  if (cached && !force && cacheMinutes > 0) {
    const age = now - new Date(cached.meta.fetchedAt).getTime();
    if (age >= 0 && age < cacheMinutes * 60000) {
      log.debug(`cache hit (${Math.round(age / 1000)}s old) ${url}`);
      return { text: cached.read(), fromCache: true, fetchedAt: cached.meta.fetchedAt, url };
    }
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2000 * 2 ** (attempt - 1), 16000);
      log.warn(`retry ${attempt}/${retries} in ${backoff}ms — ${url}`);
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { 'user-agent': USER_AGENT, accept: 'text/plain, */*' };
      if (cached && !force) {
        if (cached.meta.etag) headers['if-none-match'] = cached.meta.etag;
        if (cached.meta.lastModified) headers['if-modified-since'] = cached.meta.lastModified;
      }

      const response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });

      if (response.status === 304 && cached) {
        log.debug(`not modified ${url}`);
        const fetchedAt = new Date().toISOString();
        writeCache(url, cached.read(), { ...cached.meta, fetchedAt });
        return { text: cached.read(), fromCache: true, notModified: true, fetchedAt, url };
      }

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
        error.status = response.status;
        if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
          lastError = error;
          continue;
        }
        throw error;
      }

      const text = await response.text();
      const fetchedAt = new Date().toISOString();
      writeCache(url, text, {
        fetchedAt,
        etag: response.headers.get('etag') || null,
        lastModified: response.headers.get('last-modified') || null,
        bytes: text.length,
      });
      log.info(`fetched ${(text.length / 1048576).toFixed(2)} MB from ${url}`);
      return { text, fromCache: false, fetchedAt, url };
    } catch (error) {
      lastError = error;
      const retryable = error.name === 'AbortError' || error.name === 'TypeError' || RETRYABLE_STATUS.has(error.status);
      if (!retryable || attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }
  }

  // Network is down but we have an old copy: better stale data than none.
  if (cached) {
    log.warn(`using stale cache for ${url} — ${lastError?.message}`);
    return { text: cached.read(), fromCache: true, stale: true, fetchedAt: cached.meta.fetchedAt, url };
  }
  throw lastError || new Error(`failed to fetch ${url}`);
}

export async function postJson(url, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}
