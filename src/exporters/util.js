import { netmaskV4, netToRange, formatIP, wildcardV4 } from '../lib/ipnet.js';

/** Split a list into fixed-size chunks (device object/member limits). */
export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Keep only characters that are safe in device object names. */
export function safeName(name, { allowDash = true, max = 60 } = {}) {
  const pattern = allowDash ? /[^A-Za-z0-9_-]/g : /[^A-Za-z0-9_]/g;
  const cleaned = String(name).replace(pattern, '_').slice(0, max);
  return cleaned || 'IPCHEK';
}

/** Standard banner emitted at the top of every generated file. */
export function header(ctx, commentPrefix = '#') {
  const lines = [
    `IPChek — country IP list for ${ctx.countryName} (${ctx.country}), IPv${ctx.family}`,
    `Source: ${ctx.sourceName || ctx.source}${ctx.dataset?.sourceFetchedAt ? ` (published ${ctx.dataset.sourceFetchedAt})` : ''}`,
    `Prefixes: ${ctx.prefixes.length}${ctx.aggregated ? ' (aggregated)' : ''}`,
    `Generated: ${ctx.generatedAt}`,
    ctx.selfUrl ? `Live URL: ${ctx.selfUrl}` : null,
    'Ranges change over time — re-generate or point your device at the live URL.',
  ].filter(Boolean);
  return lines.map((line) => `${commentPrefix} ${line}`).join('\n');
}

/** `1.2.3.0 255.255.255.0` for IPv4, plain CIDR for IPv6. */
export function maskPair(net) {
  const address = formatIP(net.version, net.base);
  return net.version === 4 ? `${address} ${netmaskV4(net.prefix)}` : `${address}/${net.prefix}`;
}

export function wildcardPair(net) {
  const address = formatIP(net.version, net.base);
  return net.version === 4 ? `${address} ${wildcardV4(net.prefix)}` : `${address}/${net.prefix}`;
}

export function rangeText(net) {
  const range = netToRange(net);
  return `${formatIP(net.version, range.start)}-${formatIP(net.version, range.end)}`;
}

/** Vendor-neutral action word, defaulting to "block". */
export function actionOf(ctx, map) {
  const action = ctx.options?.action === 'allow' ? 'allow' : 'block';
  return map[action];
}
