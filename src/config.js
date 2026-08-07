import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader: `KEY=value`, `#` comments, optional quotes. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key in process.env) continue; // real environment always wins
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env'));

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const dataDir = path.resolve(ROOT, process.env.DATA_DIR || './data');

export const config = {
  root: ROOT,
  port: num(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  cacheDir: path.join(dataDir, 'cache'),
  dbFile: path.join(dataDir, 'ipchek.sqlite'),
  defaultSource: process.env.SOURCE || 'rir',
  syncIntervalMinutes: num(process.env.SYNC_INTERVAL_MINUTES, 360),
  syncOnStart: bool(process.env.SYNC_ON_START, true),
  sourceCacheMinutes: num(process.env.SOURCE_CACHE_MINUTES, 60),
  eventRetention: num(process.env.EVENT_RETENTION, 500),
  apiToken: process.env.API_TOKEN || '',
  notify: {
    webhookUrl: process.env.NOTIFY_WEBHOOK_URL || '',
    telegramBotToken: process.env.NOTIFY_TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.NOTIFY_TELEGRAM_CHAT_ID || '',
    slackWebhookUrl: process.env.NOTIFY_SLACK_WEBHOOK_URL || '',
    discordWebhookUrl: process.env.NOTIFY_DISCORD_WEBHOOK_URL || '',
  },
  version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
};

fs.mkdirSync(config.cacheDir, { recursive: true });

export default config;
