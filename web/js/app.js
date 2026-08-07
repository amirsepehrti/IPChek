import { aggregate, countAddresses, describeCount, describeCountParts, formatCidr, sortNets } from '../src/lib/ipnet.js';
import { allCountries, countryInfo } from '../src/lib/countries.js';
import { buildSpaceMap } from '../src/lib/spacemap.js';
import { CATEGORIES, describeExporters, render } from '../src/exporters/index.js';
import { renderSpaceMap, spaceMapAxis } from './spacemap.js';
import { applyTranslations, extendStrings, formatNumber, formatStamp, getLocale, isRtl, setLocale, t } from './i18n.js';
import { WEB_STRINGS } from './strings.js';
import { SOURCES, SOURCE_IDS, fetchRanges } from './sources.js';
import { compareWithSaved, deleteSnapshot, getSnapshot, saveSnapshot, toPrefixStrings } from './snapshots.js';

extendStrings(WEB_STRINGS);

const POPULAR = ['IR', 'US', 'CN', 'RU', 'DE', 'GB', 'TR', 'AE', 'NL', 'FR', 'IN', 'CA', 'JP', 'BR', 'KR'];

const $ = (selector) => document.querySelector(selector);

const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Everything the page knows: one fetched list plus the current selections. */
const state = {
  country: 'IR',
  family: 4,
  source: 'ipverse',
  nets: [],
  buckets: null,
  fetchedAt: null,
  tookMs: 0,
  error: null,
  loading: false,
};

let fetchToken = 0;
let inFlight = null;

/* -------------------------------------------------------------------------- */
/* chrome                                                                      */
/* -------------------------------------------------------------------------- */

function toast(message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  $('#toasts').append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 260);
  }, 4000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('common.copied'), 'ok');
  } catch {
    toast(t('common.copyFailed'), 'bad');
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('ipchek.theme', theme);
}

/* -------------------------------------------------------------------------- */
/* selects                                                                     */
/* -------------------------------------------------------------------------- */

function fillCountries() {
  const countries = allCountries();
  const label = (c) => `${c.flag} ${isRtl() ? c.nameFa : c.name} (${c.code})`;
  const popular = POPULAR.map((code) => countries.find((c) => c.code === code)).filter(Boolean);

  const select = $('#country');
  select.innerHTML =
    `<optgroup label="★">${popular.map((c) => `<option value="${c.code}">${escape(label(c))}</option>`).join('')}</optgroup>` +
    `<optgroup label="A–Z">${countries.map((c) => `<option value="${c.code}">${escape(label(c))}</option>`).join('')}</optgroup>`;
  select.value = state.country;
}

function fillSources() {
  const select = $('#source');
  select.innerHTML = SOURCE_IDS.map(
    (id) => `<option value="${id}">${escape(isRtl() ? SOURCES[id].nameFa : SOURCES[id].name)}</option>`,
  ).join('');
  select.value = state.source;
}

function fillFormats() {
  const grouped = {};
  for (const format of describeExporters()) (grouped[format.category] ||= []).push(format);

  const select = $('#format');
  const previous = select.value;
  select.innerHTML = Object.entries(grouped)
    .map(
      ([category, formats]) =>
        `<optgroup label="${escape(isRtl() ? CATEGORIES[category].fa : CATEGORIES[category].en)}">` +
        formats.map((f) => `<option value="${f.id}">${escape(f.name)}</option>`).join('') +
        '</optgroup>',
    )
    .join('');
  select.value = previous || 'mikrotik';
}

/* -------------------------------------------------------------------------- */
/* fetching                                                                    */
/* -------------------------------------------------------------------------- */

function showSourceWeight() {
  const source = SOURCES[state.source];
  $('#source-weight').textContent = t('web.sourceWeight', {
    w: isRtl() ? source.weightFa : source.weight,
  });
}

async function loadRanges() {
  const token = ++fetchToken;
  inFlight?.abort();
  inFlight = new AbortController();

  state.loading = true;
  state.error = null;
  renderRangeState(t('web.fetching'));

  try {
    const result = await fetchRanges(state.country, state.family, state.source, {
      signal: inFlight.signal,
      onProgress: (phase) => {
        if (token === fetchToken) {
          renderRangeState(phase === 'downloading' ? t('web.downloading') : t('web.parsing'));
        }
      },
    });
    if (token !== fetchToken) return;

    state.nets = sortNets(result.nets);
    state.fetchedAt = result.fetchedAt;
    state.tookMs = result.tookMs;
    state.buckets = buildSpaceMap(aggregate(state.nets), state.family);
    state.loading = false;
  } catch (error) {
    if (error.name === 'AbortError' || token !== fetchToken) return;
    state.nets = [];
    state.buckets = null;
    state.error = error.message;
    state.loading = false;
  }

  renderAll();
}

/* -------------------------------------------------------------------------- */
/* rendering                                                                   */
/* -------------------------------------------------------------------------- */

function renderRangeState(message) {
  $('#range-state').innerHTML = `<span class="muted"><span class="spin">◐</span> ${escape(message)}</span>`;
  $('#map-host').innerHTML = '<div class="skeleton" style="height:46px"></div>';
  $('#output').textContent = '';
  $('#output-summary').textContent = '';
}

function renderAll() {
  renderRanges();
  renderOutput();
  renderSnapshot();
}

function renderRanges() {
  const host = $('#range-state');

  if (state.error) {
    host.innerHTML =
      `<span class="failed">${escape(t('web.fetchFailed'))}: ${escape(state.error)}</span>` +
      `<button id="retry">${escape(t('web.retry'))}</button>`;
    $('#retry').addEventListener('click', loadRanges);
    $('#map-host').innerHTML = `<p class="note">${escape(t('web.fetchFailedHint'))}</p>`;
    return;
  }

  if (state.nets.length === 0) {
    host.innerHTML = `<span class="muted">${escape(t('web.emptyFamily', { f: state.family }))}</span>`;
    $('#map-host').innerHTML = '';
    return;
  }

  const merged = aggregate(state.nets);
  const size = describeCountParts(state.family, countAddresses(merged));
  host.innerHTML =
    `<span><span class="count">${formatNumber(merged.length)}</span> <span class="muted">${escape(t('common.prefixes'))}</span></span>` +
    `<span><span class="count ltr">${escape(size.value)}</span> ` +
    `<span class="muted">${size.unit === 'subnets64' ? '<span class="ltr">× /64</span>' : escape(t('common.addresses'))}</span></span>` +
    `<span class="muted">${escape(t('web.fetchedIn', { ms: formatNumber(state.tookMs) }))}</span>`;

  const comparison = compareWithSaved(state.country, state.source, state.family, state.nets);
  $('#map-host').innerHTML =
    renderSpaceMap(state.buckets, state.family, {
      added: comparison.hasSnapshot ? comparison.added : [],
      removed: comparison.hasSnapshot ? comparison.removed : [],
    }) + spaceMapAxis(state.family);
}

/** Grey out comment lines so the actual config stands out. */
function highlight(text) {
  return escape(text)
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      const isComment =
        trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith('REM ') || trimmed.startsWith('//');
      return isComment ? `<span class="cmt">${line}</span>` : line;
    })
    .join('\n');
}

function currentOutput() {
  if (!state.nets.length) return null;

  const aggregated = $('#aggregate').checked;
  const nets = aggregated ? aggregate(state.nets) : sortNets(state.nets);
  const listName = $('#list-name').value.trim();

  try {
    return render({
      format: $('#format').value,
      country: state.country,
      family: state.family,
      nets,
      prefixes: nets.map(formatCidr),
      source: state.source,
      sourceName: SOURCES[state.source].name,
      aggregated,
      listName: listName || null,
      options: { action: $('#action').value },
      dataset: { sourceFetchedAt: state.fetchedAt },
    });
  } catch (error) {
    return { error: error.message };
  }
}

const MAX_PREVIEW_LINES = 600;

function renderOutput() {
  const output = currentOutput();
  const pre = $('#output');

  if (!output) {
    pre.textContent = '';
    $('#output-summary').textContent = '';
    setOutputEnabled(false);
    return;
  }

  if (output.error) {
    pre.innerHTML = `<span class="cmt">${escape(output.error)}</span>`;
    $('#output-summary').textContent = '';
    setOutputEnabled(false);
    return;
  }

  const lines = output.body.split('\n');
  const shown = lines.slice(0, MAX_PREVIEW_LINES).join('\n');
  pre.innerHTML = highlight(shown);

  const nets = $('#aggregate').checked ? aggregate(state.nets) : state.nets;
  $('#output-summary').textContent =
    t('web.summary', {
      n: formatNumber(nets.length),
      a: describeCount(state.family, countAddresses(nets)),
    }) + (lines.length > MAX_PREVIEW_LINES ? ` · ${t('export.truncated')}` : '');

  const format = describeExporters().find((f) => f.id === $('#format').value);
  const note = isRtl() ? format?.notesFa : format?.notes;
  $('#format-note').innerHTML =
    escape(note || '') +
    (format?.docs ? ` <a href="${escape(format.docs)}" target="_blank" rel="noopener">↗</a>` : '');

  setOutputEnabled(true);
}

function setOutputEnabled(enabled) {
  $('#download').disabled = !enabled;
  $('#copy').disabled = !enabled;
}

/** Keep the format list honest about which ones handle the chosen family. */
function syncFormatAvailability() {
  const formats = describeExporters();
  const select = $('#format');
  for (const option of select.options) {
    const format = formats.find((f) => f.id === option.value);
    option.disabled = format ? !format.families.includes(state.family) : false;
  }
  if (select.selectedOptions[0]?.disabled) {
    const fallback = formats.find((f) => f.families.includes(state.family));
    if (fallback) select.value = fallback.id;
  }
}

/* -------------------------------------------------------------------------- */
/* snapshots                                                                   */
/* -------------------------------------------------------------------------- */

function renderSnapshot() {
  const host = $('#snapshot-state');
  const saveButton = $('#snapshot-save');
  const forgetButton = $('#snapshot-forget');

  const saved = getSnapshot(state.country, state.source, state.family);
  const info = countryInfo(state.country);

  if (!saved) {
    host.innerHTML = `<p class="muted snapshot-line">${escape(t('web.noSnapshot'))}</p>`;
    saveButton.textContent = t('web.save');
    saveButton.disabled = state.nets.length === 0;
    forgetButton.hidden = true;
    return;
  }

  saveButton.textContent = t('web.resave');
  saveButton.disabled = state.nets.length === 0;
  forgetButton.hidden = false;

  const when = formatStamp(saved.savedAt);
  const comparison = compareWithSaved(state.country, state.source, state.family, state.nets);

  if (state.nets.length === 0) {
    host.innerHTML = `<p class="snapshot-line muted">${escape(t('web.saved', { d: when }))}</p>`;
    return;
  }

  const headline = comparison.changed
    ? `<span class="chip on">${escape(t('web.changedSince', { d: when }))}</span>` +
      `<span class="up" style="color:var(--green)">+${formatNumber(comparison.added.length)}</span>` +
      `<span class="down" style="color:var(--red)">−${formatNumber(comparison.removed.length)}</span>`
    : `<span class="chip ok">${escape(t('web.unchangedSince', { d: when }))}</span>`;

  const blocks = (items, kind) =>
    items.length
      ? `<div class="output">${items
          .slice(0, 400)
          .map((p) => `<span style="color:var(--${kind})">${kind === 'green' ? '+' : '−'} ${escape(p)}</span>`)
          .join('\n')}</div>`
      : `<p class="muted">—</p>`;

  host.innerHTML =
    `<div class="snapshot-line">${info.flag} <span class="ltr">${escape(state.country)} · IPv${state.family}</span> ${headline}</div>` +
    (comparison.changed
      ? `<div class="grid cols-2 diff-cols">
           <section>
             <p class="eyebrow">${escape(t('changes.addedBlocks'))} (${formatNumber(comparison.added.length)})</p>
             ${blocks(comparison.added, 'green')}
           </section>
           <section>
             <p class="eyebrow">${escape(t('changes.removedBlocks'))} (${formatNumber(comparison.removed.length)})</p>
             ${blocks(comparison.removed, 'red')}
           </section>
         </div>`
      : '');
}

/* -------------------------------------------------------------------------- */
/* wiring                                                                      */
/* -------------------------------------------------------------------------- */

function readSelections() {
  state.country = $('#country').value;
  state.family = Number($('#family').value);
  state.source = $('#source').value;
}

function pushUrlState() {
  const params = new URLSearchParams({
    country: state.country,
    family: String(state.family),
    source: state.source,
    format: $('#format').value,
  });
  history.replaceState(null, '', `?${params}`);
}

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const country = (params.get('country') || '').toUpperCase();
  if (allCountries().some((c) => c.code === country)) state.country = country;
  const family = Number(params.get('family'));
  if (family === 4 || family === 6) state.family = family;
  const source = params.get('source');
  if (SOURCE_IDS.includes(source)) state.source = source;
  return params.get('format');
}

function onSelectionChanged() {
  readSelections();
  showSourceWeight();
  syncFormatAvailability();
  pushUrlState();
  loadRanges();
}

function onOutputOptionChanged() {
  pushUrlState();
  renderOutput();
}

function setLanguage(locale) {
  setLocale(locale);
  $('#lang-toggle').textContent = locale === 'fa' ? 'EN' : 'فا';
  applyTranslations();
  labelStaticBits();

  const country = state.country;
  const format = $('#format').value;
  fillCountries();
  fillSources();
  fillFormats();
  $('#country').value = country;
  $('#format').value = format;
  syncFormatAvailability();
  showSourceWeight();

  renderAll();
}

function labelStaticBits() {
  $('#no-server-chip').textContent = t('web.noServer');
  $('#gh-link').textContent = t('web.viewOnGitHub');
  document.title = `IPChek — ${t('web.tagline')}`;
}

function boot() {
  const stored = localStorage.getItem('ipchek.theme');
  applyTheme(stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  $('#theme-toggle').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
  );

  const urlFormat = readUrlState();

  setLocale(getLocale());
  $('#lang-toggle').textContent = getLocale() === 'fa' ? 'EN' : 'فا';
  applyTranslations();
  labelStaticBits();

  fillCountries();
  fillSources();
  fillFormats();
  $('#country').value = state.country;
  $('#family').value = String(state.family);
  $('#source').value = state.source;
  if (urlFormat) $('#format').value = urlFormat;
  syncFormatAvailability();
  showSourceWeight();

  $('#lang-toggle').addEventListener('click', () => setLanguage(getLocale() === 'fa' ? 'en' : 'fa'));

  for (const selector of ['#country', '#family', '#source']) {
    $(selector).addEventListener('change', onSelectionChanged);
  }
  for (const selector of ['#format', '#action', '#aggregate']) {
    $(selector).addEventListener('change', onOutputOptionChanged);
  }
  $('#list-name').addEventListener('input', () => renderOutput());

  $('#copy').addEventListener('click', () => {
    const output = currentOutput();
    if (output && !output.error) copyText(output.body);
  });

  $('#download').addEventListener('click', () => {
    const output = currentOutput();
    if (!output || output.error) return;
    const blob = new Blob([output.body], { type: `${output.mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = output.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $('#snapshot-save').addEventListener('click', () => {
    const nets = $('#aggregate').checked ? aggregate(state.nets) : state.nets;
    const ok = saveSnapshot(state.country, state.source, state.family, toPrefixStrings(nets));
    toast(ok ? t('web.savedOk') : t('web.storageFull'), ok ? 'ok' : 'bad');
    renderAll();
  });

  $('#snapshot-forget').addEventListener('click', () => {
    deleteSnapshot(state.country, state.source, state.family);
    toast(t('web.forgotten'), 'ok');
    renderAll();
  });

  setOutputEnabled(false);
  loadRanges();
}

boot();
