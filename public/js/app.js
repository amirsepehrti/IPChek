import { api } from './api.js';
import { applyTranslations, formatNumber, formatRelative, formatStamp, getLocale, isRtl, setLocale, t } from './i18n.js';
import { renderSpaceMap, spaceMapAxis } from './spacemap.js';

/* -------------------------------------------------------------------------- */
/* state                                                                       */
/* -------------------------------------------------------------------------- */

const VIEWS = ['overview', 'countries', 'export', 'monitors', 'changes', 'about'];

const state = {
  meta: null,
  countries: [],
  monitors: [],
  source: null,
  events: { items: [], total: 0, offset: 0 },
  view: 'overview',
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* -------------------------------------------------------------------------- */
/* chrome: toasts, theme, language, tabs                                       */
/* -------------------------------------------------------------------------- */

function toast(message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  $('#toasts').append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .25s';
    setTimeout(() => node.remove(), 260);
  }, 4200);
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(label || t('common.copied'), 'ok');
  } catch {
    toast(t('common.copyFailed'), 'bad');
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('ipchek.theme', theme);
}

function initTheme() {
  const stored = localStorage.getItem('ipchek.theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(stored || preferred);
  $('#theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

function renderTabs() {
  $('#tabs').innerHTML = VIEWS.map(
    (view) =>
      `<button class="tab" role="tab" data-view="${view}" aria-selected="${state.view === view}">${escape(
        t(`tab.${view}`),
      )}</button>`,
  ).join('');
  $$('#tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.view));
  });
}

function navigate(view) {
  if (!VIEWS.includes(view)) view = 'overview';
  state.view = view;
  location.hash = view;
  $$('.view').forEach((node) => node.classList.toggle('active', node.id === `view-${view}`));
  $$('#tabs .tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === view)));
  window.scrollTo({ top: 0, behavior: 'instant' });
  refreshView(view);
}

async function refreshView(view) {
  try {
    if (view === 'overview') await renderOverview();
    if (view === 'countries') await renderCountries();
    if (view === 'export') await updatePreview();
    if (view === 'monitors') await renderMonitors();
    if (view === 'changes') await loadEvents(true);
    if (view === 'about') renderAbout();
  } catch (error) {
    toast(error.message || t('common.error'), 'bad');
  }
}

function setLanguage(locale) {
  setLocale(locale);
  $('#lang-toggle').textContent = locale === 'fa' ? 'EN' : 'فا';
  applyTranslations();
  renderTabs();
  fillSelects();
  refreshView(state.view);
}

/* -------------------------------------------------------------------------- */
/* shared fragments                                                            */
/* -------------------------------------------------------------------------- */

const familyChip = (family) => `<span class="chip v${family}">IPv${family}</span>`;

function statusDot(monitor) {
  if (!monitor.enabled) return '<span class="dot idle"></span>';
  if (monitor.lastStatus === 'error') return '<span class="dot bad"></span>';
  if (monitor.lastStatus === 'ok') return '<span class="dot ok"></span>';
  return '<span class="dot idle"></span>';
}

function emptyState(title, body, cta) {
  return `<div class="empty"><strong>${escape(title)}</strong><p>${escape(body)}</p>${cta || ''}</div>`;
}

/* -------------------------------------------------------------------------- */
/* overview                                                                    */
/* -------------------------------------------------------------------------- */

async function renderOverview() {
  const [{ monitors }, stats] = await Promise.all([api.monitors(), api.stats()]);
  state.monitors = monitors;

  const cards = $('#watch-cards');
  if (!monitors.length) {
    cards.className = '';
    cards.innerHTML = emptyState(
      t('overview.emptyTitle'),
      t('overview.emptyBody'),
      `<button class="primary" id="go-countries" style="margin-top:12px">${escape(t('overview.emptyCta'))}</button>`,
    );
    $('#go-countries')?.addEventListener('click', () => navigate('countries'));
  } else {
    cards.className = 'grid cols-2';
    cards.innerHTML = monitors.map(watchCard).join('');
    for (const monitor of monitors) {
      const family = monitor.family === 0 ? 4 : monitor.family;
      loadMap(`map-${monitor.id}`, monitor.country, family, monitor.source);
    }
    $$('[data-check]').forEach((button) =>
      button.addEventListener('click', () => checkMonitor(Number(button.dataset.check))),
    );
    $$('[data-open-country]').forEach((node) =>
      node.addEventListener('click', () => openCountry(node.dataset.openCountry, node.dataset.source)),
    );
  }

  $('#stat-cards').innerHTML = [
    readout(t('overview.statCountries'), formatNumber(stats.countriesTracked)),
    readout(t('overview.statPrefixes'), formatNumber(stats.prefixes)),
    readout(
      t('overview.statChanges'),
      formatNumber(stats.events.lastWeek),
      stats.events.lastWeek > 0 ? 'warn' : '',
    ),
    readout(
      t('overview.statWatches'),
      formatNumber(stats.monitors.enabled),
      stats.monitors.failing ? 'bad' : '',
      stats.monitors.failing ? `${stats.monitors.failing} ${t('overview.statFailing')}` : nextCheckLabel(stats),
    ),
  ].join('');

  const { events } = await api.events({ limit: 8 });
  $('#recent-events').innerHTML = events.length
    ? events.map(eventRow).join('')
    : `<div class="empty" style="border:0">${escape(t('changes.empty'))}</div>`;
  bindEventRows($('#recent-events'));
}

function nextCheckLabel(stats) {
  if (!stats.scheduler.enabled) return t('about.schedulerOff');
  return `${t('overview.nextCheck')} ${formatRelative(stats.scheduler.nextTickAt)}`;
}

function readout(label, value, tone = '', sub = '') {
  return `<div class="panel readout">
    <div class="label">${escape(label)}</div>
    <div class="value ${tone}">${escape(value)}</div>
    ${sub ? `<div class="sub">${escape(sub)}</div>` : ''}
  </div>`;
}

function watchCard(monitor) {
  const family = monitor.family === 0 ? 4 : monitor.family;
  const dataset = monitor.datasets?.[family];
  const families = monitor.family === 0 ? [4, 6] : [monitor.family];

  const stats = families
    .map((fam) => {
      const data = monitor.datasets?.[fam];
      return `<div>
        <div class="n">${data ? formatNumber(data.prefixCount) : '—'}</div>
        <div class="k">IPv${fam} ${escape(t('common.prefixes'))}</div>
      </div>`;
    })
    .join('');

  const changed = monitor.lastChangeAt || dataset?.changedAt;
  return `<article class="panel watch-card">
    <div class="watch-head">
      <span class="watch-flag">${monitor.flag}</span>
      <div style="min-width:0">
        <div class="watch-name">${escape(isRtl() ? monitor.nameFa : monitor.name)}</div>
        <div class="watch-meta ltr">${escape(monitor.country)} · ${escape(monitor.source)}</div>
      </div>
      <div class="right row" style="gap:6px">
        ${statusDot(monitor)}
        ${families.map(familyChip).join('')}
      </div>
    </div>

    <div class="watch-stats">
      ${stats}
      <div>
        <div class="n ltr">${dataset ? escape(dataset.addressCountParts.value) : '—'}</div>
        <div class="k">${
          dataset?.addressCountParts.unit === 'subnets64'
            ? '<span class="ltr">× /64</span>'
            : escape(t('common.addresses'))
        }</div>
      </div>
    </div>

    <div id="map-${monitor.id}"><div class="skeleton" style="height:46px"></div></div>

    <div class="watch-foot">
      <span title="${escape(formatStamp(changed))}">
        ${escape(t('overview.lastChange'))}:
        <span class="stamp">${changed && monitor.lastChangeAt ? escape(formatStamp(changed)) : escape(t('overview.noChangeYet'))}</span>
      </span>
      <span class="row" style="gap:6px">
        <button class="ghost" data-open-country="${escape(monitor.country)}" data-source="${escape(monitor.source)}">${escape(t('common.open'))}</button>
        <button data-check="${monitor.id}">${escape(t('common.checkNow'))}</button>
      </span>
    </div>
  </article>`;
}

async function loadMap(elementId, country, family, source) {
  const host = document.getElementById(elementId);
  if (!host) return;
  try {
    const map = await api.spacemap(country, { family, source });
    host.innerHTML = renderSpaceMap(map.buckets, family) + spaceMapAxis(family);
  } catch {
    host.innerHTML = '';
  }
}

async function checkMonitor(id) {
  const button = $(`[data-check="${id}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = t('common.loading');
  }
  try {
    const response = await api.syncMonitor(id);
    const monitor = response.monitor;
    const results = response.results || [];
    const changed = results.find((r) => r.status === 'changed');
    const failed = results.find((r) => r.status === 'error');
    const summary = failed
      ? failed.error
      : changed
        ? t('monitors.resultChanged', { a: changed.added, r: changed.removed })
        : results.some((r) => r.status === 'baseline')
          ? t('monitors.resultBaseline')
          : t('monitors.resultUnchanged');
    toast(t('monitors.checked', { c: monitor.country, r: summary }), failed ? 'bad' : changed ? '' : 'ok');
    await refreshView(state.view);
  } catch (error) {
    toast(error.message, 'bad');
    if (button) {
      button.disabled = false;
      button.textContent = t('common.checkNow');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* countries                                                                   */
/* -------------------------------------------------------------------------- */

let countryFilterTimer = null;

async function renderCountries() {
  const source = $('#countries-source').value || state.source;
  const grid = $('#country-grid');
  grid.innerHTML = '<div class="skeleton" style="height:44px"></div>'.repeat(8);

  const { countries } = await api.countries({
    source,
    q: $('#country-search').value,
    continent: $('#continent-filter').value,
  });

  const onlyWatched = $('#only-watched').checked;
  const list = onlyWatched ? countries.filter((c) => c.monitored) : countries;
  state.countries = countries;

  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${escape(t('countries.none'))}</div>`;
    return;
  }

  grid.innerHTML = list
    .map((country) => {
      const has = country.datasets?.[4] || country.datasets?.[6];
      return `<button class="country-tile ${country.monitored ? 'watched' : ''}" data-code="${escape(country.code)}">
        <span class="f">${country.flag}</span>
        <span style="min-width:0">
          <span class="n" style="display:block">${escape(isRtl() ? country.nameFa : country.name)}</span>
          <span class="c ltr">${escape(country.code)}${has ? ` · ${formatNumber(has.prefixCount)}` : ''}</span>
        </span>
      </button>`;
    })
    .join('');

  $$('.country-tile', grid).forEach((tile) =>
    tile.addEventListener('click', () => openCountry(tile.dataset.code, source)),
  );
}

function scheduleCountryRefresh() {
  clearTimeout(countryFilterTimer);
  countryFilterTimer = setTimeout(() => renderCountries().catch((e) => toast(e.message, 'bad')), 220);
}

/* -------------------------------------------------------------------------- */
/* country detail dialog                                                       */
/* -------------------------------------------------------------------------- */

async function openCountry(code, source) {
  const dialog = $('#detail');
  const useSource = source || $('#countries-source')?.value || state.source;
  dialog.innerHTML = `<div class="dialog-head"><h2>${escape(code)}</h2></div>
    <div class="dialog-body"><div class="skeleton" style="height:120px"></div></div>`;
  dialog.showModal();

  try {
    const info = await api.country(code, { source: useSource });
    const families = [4, 6].filter((family) => info.datasets[family]);
    const primary = families[0] || 4;

    dialog.innerHTML = `
      <div class="dialog-head">
        <div class="row">
          <span style="font-size:22px">${info.flag}</span>
          <div>
            <h2>${escape(isRtl() ? info.nameFa : info.name)}</h2>
            <div class="muted ltr" style="font-size:11px">${escape(info.code)} · ${escape(useSource)}</div>
          </div>
        </div>
        <button class="ghost" id="detail-close">${escape(t('common.close'))}</button>
      </div>
      <div class="dialog-body">
        ${
          families.length
            ? families
                .map(
                  (family) => `
          <section>
            <p class="eyebrow">IPv${family} · ${escape(t('detail.spaceMap'))}</p>
            <div id="detail-map-${family}"><div class="skeleton" style="height:46px"></div></div>
            <div class="row" style="margin-top:10px;gap:18px">
              <span><strong>${formatNumber(info.datasets[family].prefixCount)}</strong> <span class="muted">${escape(t('common.prefixes'))}</span></span>
              <span class="ltr"><strong>${escape(info.datasets[family].addressCountHuman)}</strong></span>
            </div>
            <p class="muted" style="font-size:11px;margin:8px 0 0">
              ${escape(t('detail.published'))}: <span class="stamp">${escape(formatStamp(info.datasets[family].sourceFetchedAt))}</span> ·
              ${escape(t('detail.stored'))}: <span class="stamp">${escape(formatStamp(info.datasets[family].syncedAt))}</span>
            </p>
          </section>`,
                )
                .join('')
            : `<div class="empty">${escape(t('detail.notFetched'))}<div style="margin-top:12px"><button class="primary" id="detail-fetch">${escape(t('detail.fetchNow'))}</button></div></div>`
        }

        <p class="note">${escape(primary === 6 ? t('detail.spaceMapHintV6') : t('detail.spaceMapHint'))}</p>

        <div class="row">
          <button class="primary" id="detail-export">${escape(t('detail.exportThis'))}</button>
          <button id="detail-watch">${escape(info.monitors.length ? t('common.checkNow') : t('common.watch'))}</button>
        </div>

        <section>
          <p class="eyebrow">${escape(t('detail.recentEvents'))}</p>
          ${
            info.events.length
              ? `<div class="table-wrap">${info.events.map(eventRow).join('')}</div>`
              : `<p class="muted">${escape(t('detail.noEvents'))}</p>`
          }
        </section>
      </div>`;

    $('#detail-close').addEventListener('click', () => dialog.close());
    bindEventRows(dialog);

    for (const family of families) {
      loadMap(`detail-map-${family}`, info.code, family, useSource);
    }

    $('#detail-fetch')?.addEventListener('click', async (event) => {
      event.target.disabled = true;
      event.target.textContent = t('common.loading');
      try {
        await api.sync({ country: info.code, source: useSource, family: 0 });
        dialog.close();
        await openCountry(info.code, useSource);
      } catch (error) {
        toast(error.message, 'bad');
        event.target.disabled = false;
        event.target.textContent = t('detail.fetchNow');
      }
    });

    $('#detail-export').addEventListener('click', () => {
      dialog.close();
      $('#ex-country').value = info.code;
      $('#ex-source').value = useSource;
      navigate('export');
    });

    $('#detail-watch').addEventListener('click', async (event) => {
      event.target.disabled = true;
      try {
        if (info.monitors.length) {
          await api.syncMonitor(info.monitors[0].id);
          toast(t('monitors.checked', { c: info.code, r: t('monitors.resultUnchanged') }), 'ok');
        } else {
          await api.addMonitor({ country: info.code, source: useSource, family: 0 });
          toast(t('monitors.added', { c: info.code }), 'ok');
        }
        dialog.close();
        await refreshView(state.view);
      } catch (error) {
        toast(error.message, 'bad');
        event.target.disabled = false;
      }
    });
  } catch (error) {
    dialog.innerHTML = `<div class="dialog-body"><div class="empty"><strong>${escape(t('common.error'))}</strong><p>${escape(error.message)}</p>
      <button class="primary" style="margin-top:10px" onclick="this.closest('dialog').close()">${escape(t('common.close'))}</button></div></div>`;
  }
}

/* -------------------------------------------------------------------------- */
/* export builder                                                              */
/* -------------------------------------------------------------------------- */

let previewController = null;
let previewTimer = null;

function exportParams() {
  return {
    country: $('#ex-country').value,
    family: Number($('#ex-family').value),
    source: $('#ex-source').value,
    format: $('#ex-format').value,
    aggregate: $('#ex-aggregate').checked,
    action: $('#ex-action').value,
    list: $('#ex-list').value.trim(),
  };
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => updatePreview().catch((e) => toast(e.message, 'bad')), 180);
}

/** Grey out comment lines so the actual config stands out in the preview. */
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

async function updatePreview(refresh = false) {
  const params = exportParams();
  if (!params.country) return;

  const output = $('#ex-output');
  output.textContent = t('export.building');

  previewController?.abort();
  previewController = new AbortController();

  try {
    const result = await api.preview(
      params.country,
      {
        family: params.family,
        source: params.source,
        format: params.format,
        aggregate: params.aggregate,
        action: params.action,
        list: params.list,
        refresh: refresh || undefined,
      },
      previewController.signal,
    );

    output.innerHTML = highlight(result.preview);
    $('#ex-count').textContent =
      t('export.lines', { n: formatNumber(result.prefixCount), a: result.addressCountHuman }) +
      (result.truncated ? ` · ${t('export.truncated')}` : '');

    const note = isRtl() ? result.exporter.notesFa || result.exporter.notes : result.exporter.notes;
    $('#ex-note').innerHTML = escape(note || '') + (result.exporter.docs
      ? ` <a href="${escape(result.exporter.docs)}" target="_blank" rel="noopener">↗</a>`
      : '');

    $('#ex-url').textContent = result.liveUrl || '';
    $('#ex-download').dataset.url = result.downloadUrl;
    output.dataset.filename = result.filename;
  } catch (error) {
    if (error.name === 'AbortError') return;
    output.innerHTML = `<span class="cmt">${escape(error.message)}</span>`;
    $('#ex-count').textContent = '';
  }
}

function wireExport() {
  ['#ex-country', '#ex-family', '#ex-source', '#ex-format', '#ex-action'].forEach((selector) =>
    $(selector).addEventListener('change', () => updatePreview().catch(() => {})),
  );
  $('#ex-aggregate').addEventListener('change', () => updatePreview().catch(() => {}));
  $('#ex-list').addEventListener('input', schedulePreview);

  $('#ex-download').addEventListener('click', () => {
    const params = exportParams();
    window.location.href = api.exportUrl(params.country, params.format, {
      family: params.family,
      source: params.source,
      aggregate: params.aggregate,
      action: params.action,
      list: params.list,
      download: 1,
    });
  });

  $('#ex-copy').addEventListener('click', async () => {
    const params = exportParams();
    const response = await fetch(
      api.exportUrl(params.country, params.format, {
        family: params.family,
        source: params.source,
        aggregate: params.aggregate,
        action: params.action,
        list: params.list,
      }),
    );
    await copy(await response.text());
  });

  $('#ex-url-copy').addEventListener('click', () => copy($('#ex-url').textContent));

  $('#ex-refresh').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      await updatePreview(true);
      const country = $('#ex-country').value;
      toast(t('monitors.checked', { c: country, r: t('monitors.resultUnchanged') }), 'ok');
    } finally {
      event.target.disabled = false;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* monitors                                                                    */
/* -------------------------------------------------------------------------- */

async function renderMonitors() {
  const { monitors, defaultIntervalMinutes } = await api.monitors();
  state.monitors = monitors;

  const host = $('#monitor-list');
  if (!monitors.length) {
    host.innerHTML = `<div class="empty">${escape(t('monitors.empty'))}</div>`;
    return;
  }

  host.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>${escape(t('monitors.colCountry'))}</th>
      <th>${escape(t('monitors.colFamily'))}</th>
      <th>${escape(t('monitors.colSource'))}</th>
      <th>${escape(t('monitors.colRanges'))}</th>
      <th>${escape(t('monitors.colChecked'))}</th>
      <th>${escape(t('monitors.colChanged'))}</th>
      <th></th>
    </tr></thead>
    <tbody>${monitors.map((monitor) => monitorRow(monitor, defaultIntervalMinutes)).join('')}</tbody>
  </table></div>`;

  $$('[data-check]', host).forEach((button) =>
    button.addEventListener('click', () => checkMonitor(Number(button.dataset.check))),
  );
  $$('[data-toggle]', host).forEach((button) =>
    button.addEventListener('click', async () => {
      const monitor = monitors.find((m) => m.id === Number(button.dataset.toggle));
      await api.patchMonitor(monitor.id, { enabled: !monitor.enabled });
      await renderMonitors();
    }),
  );
  $$('[data-remove]', host).forEach((button) =>
    button.addEventListener('click', async () => {
      const monitor = monitors.find((m) => m.id === Number(button.dataset.remove));
      if (!confirm(t('monitors.removeConfirm', { c: monitor.country }))) return;
      await api.deleteMonitor(monitor.id);
      toast(t('monitors.removed', { c: monitor.country }), 'ok');
      await renderMonitors();
    }),
  );
}

function monitorRow(monitor, defaultInterval) {
  const families = monitor.family === 0 ? [4, 6] : [monitor.family];
  const ranges = families
    .map((family) => {
      const data = monitor.datasets?.[family];
      return data ? `IPv${family}: ${formatNumber(data.prefixCount)}` : `IPv${family}: —`;
    })
    .join(' · ');

  const interval = monitor.intervalMinutes || defaultInterval;
  return `<tr>
    <td>
      <div class="row nowrap" style="gap:7px;flex-wrap:nowrap">${statusDot(monitor)} <span>${monitor.flag}</span>
      <span>${escape(isRtl() ? monitor.nameFa : monitor.name)}</span>
      <span class="muted ltr">${escape(monitor.country)}</span></div>
      ${monitor.lastError ? `<div class="muted" style="font-size:11px;color:var(--red)">${escape(monitor.lastError)}</div>` : ''}
    </td>
    <td class="nowrap">${families.map(familyChip).join(' ')}</td>
    <td class="ltr">${escape(monitor.source)}<div class="muted" style="font-size:10px">${escape(t('monitors.every'))} ${interval}m</div></td>
    <td class="nowrap ltr">${escape(ranges)}</td>
    <td class="nowrap"><span class="stamp">${escape(formatStamp(monitor.lastCheckedAt))}</span></td>
    <td class="nowrap">${
      monitor.lastChangeAt
        ? `<span class="stamp">${escape(formatStamp(monitor.lastChangeAt))}</span>`
        : `<span class="muted">${escape(t('overview.noChangeYet'))}</span>`
    }</td>
    <td class="actions">
      <button data-check="${monitor.id}">${escape(t('common.checkNow'))}</button>
      <button class="ghost" data-toggle="${monitor.id}">${escape(monitor.enabled ? t('monitors.pause') : t('monitors.resume'))}</button>
      <button class="ghost danger" data-remove="${monitor.id}">${escape(t('monitors.remove'))}</button>
    </td>
  </tr>`;
}

async function addMonitor() {
  const button = $('#mon-add');
  button.disabled = true;
  const country = $('#mon-country').value;
  try {
    await api.addMonitor({
      country,
      source: $('#mon-source').value,
      family: Number($('#mon-family').value),
      intervalMinutes: $('#mon-interval').value ? Number($('#mon-interval').value) : null,
    });
    toast(t('monitors.added', { c: country }), 'ok');
    await renderMonitors();
  } catch (error) {
    toast(error.message, 'bad');
  } finally {
    button.disabled = false;
  }
}

/* -------------------------------------------------------------------------- */
/* change history                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Event copy is built from the structured fields rather than the message the
 * server stored, so history reads in the reader's language. Errors keep the
 * server's own text — it is the actionable part.
 */
function eventText(event) {
  if (event.type === 'error') return event.message || t('changes.error');
  if (event.type === 'baseline') return t('changes.msgBaseline', { n: formatNumber(event.prefixCountAfter ?? 0) });
  if (event.addedCount === 0 && event.removedCount === 0) return t('changes.msgReorg');
  return t('changes.msgChange', { a: formatNumber(event.addedCount), r: formatNumber(event.removedCount) });
}

function eventRow(event) {
  const kind =
    event.type === 'error'
      ? `<span class="chip bad">${escape(t('changes.error'))}</span>`
      : event.type === 'baseline'
        ? `<span class="chip">${escape(t('changes.baseline'))}</span>`
        : event.addedCount === 0 && event.removedCount === 0
          ? `<span class="chip">${escape(t('changes.reorganised'))}</span>`
          : '';

  return `<div class="event" data-event="${event.id}" tabindex="0" role="button">
    <span class="when stamp">${escape(formatStamp(event.detectedAt))}</span>
    <span class="what">
      <span class="title">${event.flag || ''} ${escape(isRtl() ? event.countryNameFa : event.countryName)}
        ${familyChip(event.family)} ${kind}</span>
      <span class="detail">${escape(eventText(event))}</span>
    </span>
    <span class="delta">${
      event.type === 'change'
        ? `<span class="up">+${formatNumber(event.addedCount)}</span><span class="down">−${formatNumber(event.removedCount)}</span>`
        : ''
    }</span>
  </div>`;
}

function bindEventRows(root) {
  $$('[data-event]', root).forEach((row) => {
    const open = () => openEvent(Number(row.dataset.event));
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

async function loadEvents(reset = false) {
  if (reset) state.events = { items: [], total: 0, offset: 0 };
  const response = await api.events({
    limit: 40,
    offset: state.events.offset,
    country: $('#ev-country').value || undefined,
    type: $('#ev-type').value || undefined,
  });

  state.events.items.push(...response.events);
  state.events.total = response.total;
  state.events.offset += response.events.length;

  const host = $('#event-list');
  host.innerHTML = state.events.items.length
    ? state.events.items.map(eventRow).join('')
    : `<div class="empty" style="border:0">${escape(t('changes.empty'))}</div>`;
  bindEventRows(host);

  const more = $('#ev-more');
  const remaining = state.events.total - state.events.items.length;
  more.style.display = remaining > 0 ? '' : 'none';
  more.textContent = `${t('changes.loadMore')} (${formatNumber(Math.max(remaining, 0))})`;
}

async function openEvent(id) {
  const dialog = $('#detail');
  dialog.innerHTML = `<div class="dialog-body"><div class="skeleton" style="height:100px"></div></div>`;
  dialog.showModal();

  try {
    const event = await api.event(id);
    let map = '';
    if (event.type !== 'error') {
      try {
        const data = await api.spacemap(event.country, { family: event.family, source: event.source });
        const hasDelta = (event.added?.length || 0) + (event.removed?.length || 0) > 0;
        map =
          renderSpaceMap(data.buckets, event.family, { added: event.added, removed: event.removed }) +
          spaceMapAxis(event.family) +
          (hasDelta
            ? `<div class="map-legend">
                 <span><i style="background:var(--${event.family === 6 ? 'cyan' : 'amber'})"></i>${escape(t('detail.spaceMap'))}</span>
                 <span><i style="background:var(--green)"></i>${escape(t('changes.addedBlocks'))}</span>
                 <span><i style="background:var(--red)"></i>${escape(t('changes.removedBlocks'))}</span>
               </div>`
            : '');
      } catch {
        map = '';
      }
    }

    const blockList = (items, kind) =>
      items.length
        ? `<div class="output" style="max-height:190px">${items
            .slice(0, 800)
            .map((prefix) => `<span style="color:var(--${kind})">${kind === 'green' ? '+' : '−'} ${escape(prefix)}</span>`)
            .join('\n')}</div>`
        : `<p class="muted">—</p>`;

    // A baseline has nothing to compare against and an error has no data at
    // all, so neither gets the added/removed columns.
    const isChange = event.type === 'change';
    const deltaReadout = isChange
      ? `<div class="readout">
           <div class="label">${escape(t('changes.addressCount'))}</div>
           <div class="value ltr" style="font-size:16px">${
             event.addressDelta && event.addressDelta !== '0'
               ? (event.addressDelta.startsWith('-') ? '−' : '+') +
                 formatNumber(BigInt(event.addressDelta.replace('-', '')))
               : '—'
           }</div>
         </div>`
      : `<div class="readout">
           <div class="label">${escape(t('changes.addressCount'))}</div>
           <div class="value ltr" style="font-size:16px">${
             event.addressCountAfter ? formatNumber(BigInt(event.addressCountAfter)) : '—'
           }</div>
         </div>`;

    dialog.innerHTML = `
      <div class="dialog-head">
        <div class="row">
          <span style="font-size:20px">${event.flag}</span>
          <div>
            <h2>${escape(t('changes.detailTitle'))}</h2>
            <div class="muted" style="font-size:11px">
              ${escape(isRtl() ? event.countryNameFa : event.countryName)} · IPv${event.family} · ${escape(event.source)}
            </div>
          </div>
        </div>
        <button class="ghost" id="detail-close">${escape(t('common.close'))}</button>
      </div>
      <div class="dialog-body">
        <div class="grid cols-3">
          <div class="readout">
            <div class="label">${escape(t('changes.detectedAt'))}</div>
            <div class="value stamp" style="font-size:16px">${escape(formatStamp(event.detectedAt))}</div>
            <div class="sub">${escape(formatRelative(event.detectedAt))}</div>
          </div>
          <div class="readout">
            <div class="label">${escape(isChange ? t('changes.prefixCount') : t('changes.currentPrefixes'))}</div>
            <div class="value" style="font-size:16px">${
              isChange && event.prefixCountBefore != null
                ? `${formatNumber(event.prefixCountBefore)} → ${formatNumber(event.prefixCountAfter)}`
                : formatNumber(event.prefixCountAfter ?? 0)
            }</div>
          </div>
          ${deltaReadout}
        </div>

        ${map ? `<section><p class="eyebrow">${escape(t('detail.spaceMap'))}</p>${map}</section>` : ''}

        <p class="note">${escape(eventText(event))}</p>

        ${
          isChange
            ? `<div class="grid cols-2">
                 <section>
                   <p class="eyebrow">${escape(t('changes.addedBlocks'))} (${formatNumber(event.addedCount)})</p>
                   ${blockList(event.added || [], 'green')}
                 </section>
                 <section>
                   <p class="eyebrow">${escape(t('changes.removedBlocks'))} (${formatNumber(event.removedCount)})</p>
                   ${blockList(event.removed || [], 'red')}
                 </section>
               </div>`
            : ''
        }
      </div>`;

    $('#detail-close').addEventListener('click', () => dialog.close());
  } catch (error) {
    dialog.innerHTML = `<div class="dialog-body"><div class="empty"><strong>${escape(t('common.error'))}</strong><p>${escape(error.message)}</p></div></div>`;
  }
}

/* -------------------------------------------------------------------------- */
/* setup view                                                                  */
/* -------------------------------------------------------------------------- */

function renderAbout() {
  const meta = state.meta;
  const channels = Object.entries(meta.notifications);

  $('#about-panels').innerHTML = `
    <div class="panel">
      <p class="eyebrow">${escape(t('about.sources'))}</p>
      <div class="stack">
        ${meta.sources
          .map(
            (source) => `<div>
              <div class="row">
                <strong class="ltr">${escape(source.name)}</strong>
                ${source.isDefault ? '<span class="chip on">default</span>' : ''}
              </div>
              <p class="muted" style="margin:4px 0 0;font-size:11.5px">${escape(
                isRtl() ? source.descriptionFa : source.description,
              )}</p>
              <p style="margin:4px 0 0;font-size:11px">
                <a href="${escape(source.homepage)}" target="_blank" rel="noopener" class="ltr">${escape(source.homepage)}</a>
              </p>
            </div>`,
          )
          .join('')}
      </div>
    </div>

    <div class="panel">
      <p class="eyebrow">${escape(t('about.schedule'))}</p>
      <p>${
        meta.scheduler.intervalMinutes > 0
          ? escape(`${t('about.intervalLabel')}: ${t('about.everyMinutes', { n: meta.scheduler.intervalMinutes })}`)
          : escape(t('about.schedulerOff'))
      }</p>

      <p class="eyebrow" style="margin-top:18px">${escape(t('about.notifications'))}</p>
      <p class="muted" style="font-size:12px">${escape(t('about.notificationsBody'))}</p>
      <div class="row" style="margin:10px 0">
        ${channels
          .map(
            ([name, ready]) =>
              `<span class="chip ${ready ? 'ok' : ''}">${escape(name)} · ${escape(
                ready ? t('about.notifyOn') : t('about.notifyOff'),
              )}</span>`,
          )
          .join('')}
      </div>
      <button id="test-notify">${escape(t('about.testNotify'))}</button>

      <p class="eyebrow" style="margin-top:18px">${escape(t('about.formats'))}</p>
      <p class="muted" style="font-size:12px">${escape(t('about.formatsBody', { n: meta.formats.length }))}</p>

      <p class="eyebrow" style="margin-top:18px">${escape(t('about.apiTitle'))}</p>
      <p class="muted" style="font-size:12px">${escape(t('about.apiBody'))}</p>
      <div class="url-row" style="margin-top:8px"><code>GET /api/export/IR/mikrotik?family=4</code></div>
    </div>`;

  $('#test-notify').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      const result = await api.testNotify();
      toast(
        result.delivered.length ? t('about.testSent', { c: result.delivered.join(', ') }) : t('about.testNone'),
        result.delivered.length ? 'ok' : 'bad',
      );
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      event.target.disabled = false;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* selects                                                                     */
/* -------------------------------------------------------------------------- */

function fillSelects() {
  const meta = state.meta;
  if (!meta) return;

  const sourceOptions = meta.sources
    .map((source) => `<option value="${escape(source.id)}">${escape(source.name)}</option>`)
    .join('');
  for (const id of ['#ex-source', '#mon-source', '#countries-source']) {
    const select = $(id);
    const previous = select.value;
    select.innerHTML = sourceOptions;
    select.value = previous || state.source;
  }

  const grouped = {};
  for (const format of meta.formats) {
    (grouped[format.category] ||= []).push(format);
  }
  const formatSelect = $('#ex-format');
  const previousFormat = formatSelect.value;
  formatSelect.innerHTML = Object.entries(grouped)
    .map(
      ([category, formats]) =>
        `<optgroup label="${escape(isRtl() ? meta.categories[category].fa : meta.categories[category].en)}">` +
        formats.map((format) => `<option value="${escape(format.id)}">${escape(format.name)}</option>`).join('') +
        '</optgroup>',
    )
    .join('');
  formatSelect.value = previousFormat || 'mikrotik';

  const continentSelect = $('#continent-filter');
  const previousContinent = continentSelect.value;
  continentSelect.innerHTML =
    `<option value="">${escape(t('countries.allRegions'))}</option>` +
    Object.entries(meta.continents)
      .map(([code, names]) => `<option value="${escape(code)}">${escape(isRtl() ? names.fa : names.en)}</option>`)
      .join('');
  continentSelect.value = previousContinent;

  const intervalSelect = $('#mon-interval');
  const previousInterval = intervalSelect.value;
  intervalSelect.innerHTML = [
    `<option value="">${escape(t('monitors.defaultInterval', { n: `${meta.scheduler.intervalMinutes}m` }))}</option>`,
    `<option value="60">${escape(t('monitors.hour'))}</option>`,
    `<option value="360">${escape(t('monitors.hours', { n: 6 }))}</option>`,
    `<option value="720">${escape(t('monitors.hours', { n: 12 }))}</option>`,
    `<option value="1440">${escape(t('monitors.hours', { n: 24 }))}</option>`,
  ].join('');
  intervalSelect.value = previousInterval;
}

function fillCountrySelects(countries) {
  const popular = state.meta.popular
    .map((code) => countries.find((c) => c.code === code))
    .filter(Boolean);
  const label = (country) => `${country.flag} ${isRtl() ? country.nameFa : country.name} (${country.code})`;

  const options =
    `<optgroup label="★">${popular.map((c) => `<option value="${c.code}">${escape(label(c))}</option>`).join('')}</optgroup>` +
    `<optgroup label="A–Z">${countries.map((c) => `<option value="${c.code}">${escape(label(c))}</option>`).join('')}</optgroup>`;

  for (const id of ['#ex-country', '#mon-country']) {
    const select = $(id);
    const previous = select.value;
    select.innerHTML = options;
    select.value = previous || 'IR';
  }

  const eventCountry = $('#ev-country');
  const previousEventCountry = eventCountry.value;
  eventCountry.innerHTML =
    `<option value="">${escape(t('changes.allCountries'))}</option>` +
    countries.map((c) => `<option value="${c.code}">${escape(label(c))}</option>`).join('');
  eventCountry.value = previousEventCountry;
}

/* -------------------------------------------------------------------------- */
/* boot                                                                        */
/* -------------------------------------------------------------------------- */

async function boot() {
  initTheme();
  setLocale(getLocale());
  $('#lang-toggle').textContent = getLocale() === 'fa' ? 'EN' : 'فا';
  applyTranslations();

  $('#lang-toggle').addEventListener('click', () => setLanguage(getLocale() === 'fa' ? 'en' : 'fa'));

  try {
    state.meta = await api.meta();
  } catch (error) {
    document.body.innerHTML = `<div class="empty" style="margin:60px auto;max-width:420px"><strong>${escape(
      t('common.error'),
    )}</strong><p>${escape(error.message)}</p></div>`;
    return;
  }

  state.source = state.meta.defaultSource;
  $('#version').textContent = `v${state.meta.version}`;

  renderTabs();
  fillSelects();

  const { countries } = await api.countries({ source: state.source });
  fillCountrySelects(countries);

  wireExport();
  $('#mon-add').addEventListener('click', addMonitor);
  $('#country-search').addEventListener('input', scheduleCountryRefresh);
  $('#continent-filter').addEventListener('change', () => renderCountries().catch(() => {}));
  $('#countries-source').addEventListener('change', () => renderCountries().catch(() => {}));
  $('#only-watched').addEventListener('change', () => renderCountries().catch(() => {}));
  $('#ev-country').addEventListener('change', () => loadEvents(true));
  $('#ev-type').addEventListener('change', () => loadEvents(true));
  $('#ev-refresh').addEventListener('click', () => loadEvents(true));
  $('#ev-more').addEventListener('click', () => loadEvents(false));

  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
  navigate(location.hash.slice(1) || 'overview');
}

boot();
