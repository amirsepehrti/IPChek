import config from '../config.js';
import { countryInfo } from '../lib/countries.js';
import { postJson } from '../lib/http.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('notify');

const SAMPLE = 8;

function buildSummary(event) {
  const country = countryInfo(event.country);
  const when = new Date(event.detectedAt).toISOString().replace('T', ' ').replace('Z', ' UTC');
  const lines = [
    `${country.flag} ${country.name} (${country.code}) — IPv${event.family} ranges changed`,
    `Source: ${event.source} · Detected: ${when}`,
    `Prefixes: ${event.prefixCountBefore} → ${event.prefixCountAfter}`,
    `Added: ${event.added?.length || 0} block(s) · Removed: ${event.removed?.length || 0} block(s)`,
  ];
  if (event.added?.length) {
    lines.push(`+ ${event.added.slice(0, SAMPLE).join(', ')}${event.added.length > SAMPLE ? ' …' : ''}`);
  }
  if (event.removed?.length) {
    lines.push(`- ${event.removed.slice(0, SAMPLE).join(', ')}${event.removed.length > SAMPLE ? ' …' : ''}`);
  }
  return lines.join('\n');
}

async function sendTelegram(text) {
  const { telegramBotToken: token, telegramChatId: chat } = config.notify;
  if (!token || !chat) return false;
  await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chat,
    text,
    disable_web_page_preview: true,
  });
  return true;
}

async function sendSlack(text) {
  if (!config.notify.slackWebhookUrl) return false;
  await postJson(config.notify.slackWebhookUrl, { text });
  return true;
}

async function sendDiscord(text) {
  if (!config.notify.discordWebhookUrl) return false;
  // Discord rejects bodies over 2000 characters.
  await postJson(config.notify.discordWebhookUrl, { content: text.slice(0, 1900) });
  return true;
}

async function sendWebhook(event, text) {
  if (!config.notify.webhookUrl) return false;
  await postJson(config.notify.webhookUrl, {
    type: 'ipchek.change',
    summary: text,
    event: {
      ...event,
      addressCountBefore: event.addressCountBefore != null ? String(event.addressCountBefore) : null,
      addressCountAfter: event.addressCountAfter != null ? String(event.addressCountAfter) : null,
      addressDelta: event.addressDelta != null ? String(event.addressDelta) : null,
    },
  });
  return true;
}

/** Fan out a change event to every configured channel; failures never block a sync. */
export async function notifyChange(event) {
  const text = buildSummary(event);
  const channels = [
    ['webhook', () => sendWebhook(event, text)],
    ['telegram', () => sendTelegram(text)],
    ['slack', () => sendSlack(text)],
    ['discord', () => sendDiscord(text)],
  ];

  const delivered = [];
  await Promise.all(
    channels.map(async ([name, send]) => {
      try {
        if (await send()) delivered.push(name);
      } catch (error) {
        log.warn(`${name} delivery failed: ${error.message}`);
      }
    }),
  );

  if (delivered.length) log.info(`notified via ${delivered.join(', ')}`);
  return delivered;
}

export function configuredChannels() {
  return {
    webhook: !!config.notify.webhookUrl,
    telegram: !!(config.notify.telegramBotToken && config.notify.telegramChatId),
    slack: !!config.notify.slackWebhookUrl,
    discord: !!config.notify.discordWebhookUrl,
  };
}

/** Used by the "send test notification" button in the UI. */
export async function sendTestNotification() {
  return notifyChange({
    country: 'IR',
    source: 'test',
    family: 4,
    detectedAt: new Date().toISOString(),
    prefixCountBefore: 1738,
    prefixCountAfter: 1739,
    added: ['203.0.113.0/24'],
    removed: [],
    message: 'IPChek test notification',
  });
}
