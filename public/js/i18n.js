/**
 * English and Persian copy for the whole interface.
 *
 * Persian switches the document to RTL and to a Persian font stack; addresses,
 * timestamps and generated config stay left-to-right wherever they appear.
 */

const STRINGS = {
  en: {
    'tab.overview': 'Overview',
    'tab.countries': 'Countries',
    'tab.export': 'Export',
    'tab.monitors': 'Watch list',
    'tab.changes': 'Changes',
    'tab.about': 'Setup',

    'common.country': 'Country',
    'common.source': 'Data source',
    'common.family': 'Address family',
    'common.bothFamilies': 'IPv4 + IPv6',
    'common.prefixes': 'prefixes',
    'common.addresses': 'addresses',
    'common.never': 'never',
    'common.loading': 'Loading…',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.copied': 'Copied to clipboard',
    'common.copyFailed': 'Could not copy — select the text and copy manually',
    'common.error': 'Something went wrong',
    'common.watch': 'Watch',
    'common.watching': 'Watching',
    'common.unwatch': 'Stop watching',
    'common.checkNow': 'Check now',
    'common.open': 'Open',
    'common.retry': 'Try again',

    'overview.watching': 'On watch',
    'overview.atAGlance': 'At a glance',
    'overview.recent': 'Recent changes',
    'overview.emptyTitle': 'Nothing on watch yet',
    'overview.emptyBody': 'Pick a country and IPChek records its ranges, then tells you the moment they move.',
    'overview.emptyCta': 'Choose a country',
    'overview.lastChange': 'Last change',
    'overview.lastCheck': 'Last check',
    'overview.noChangeYet': 'no change since the baseline',
    'overview.statCountries': 'Countries tracked',
    'overview.statPrefixes': 'Prefixes stored',
    'overview.statChanges': 'Changes in 7 days',
    'overview.statWatches': 'Active watches',
    'overview.statFailing': 'failing',
    'overview.nextCheck': 'Next check',

    'countries.title': 'Every country, current ranges',
    'countries.lede':
      'Ranges come straight from the source you choose and are stored the first time you open a country. Click one to see where its address space sits.',
    'countries.search': 'Search',
    'countries.searchPlaceholder': 'Iran, IR, ایران…',
    'countries.region': 'Region',
    'countries.allRegions': 'All regions',
    'countries.onlyWatched': 'On watch only',
    'countries.none': 'No country matches that search.',
    'countries.count': '{n} countries',

    'detail.spaceMap': 'Where its addresses live',
    'detail.spaceMapHint':
      'Each column is one /8 block of the IPv4 space, from 0.0.0.0 on the left to 255.0.0.0 on the right. Taller means the country holds more of that block.',
    'detail.spaceMapHintV6': 'Columns slice the global IPv6 unicast range 2000::/3 from left to right.',
    'detail.notFetched': 'Not fetched yet',
    'detail.fetchNow': 'Fetch ranges',
    'detail.exportThis': 'Export this list',
    'detail.recentEvents': 'History',
    'detail.noEvents': 'No history recorded yet.',
    'detail.published': 'Source published',
    'detail.stored': 'Stored here',

    'export.title': 'Build a config for your device',
    'export.lede':
      'Pick a country and a device. IPChek writes the config you can paste, or gives you a URL the device can fetch on its own schedule.',
    'export.format': 'Device / format',
    'export.listName': 'List name on the device',
    'export.action': 'Rules should',
    'export.actionBlock': 'Block this country',
    'export.actionAllow': 'Allow this country',
    'export.aggregate': 'Merge adjacent blocks (fewer rules, same coverage)',
    'export.preview': 'Preview',
    'export.download': 'Download file',
    'export.copy': 'Copy config',
    'export.copyShort': 'Copy',
    'export.refresh': 'Re-fetch from source',
    'export.liveUrl': 'Live URL',
    'export.liveUrlHint':
      'Point the device at this URL to keep itself updated. It always serves the current list.',
    'export.lines': '{n} prefixes · {a}',
    'export.truncated': 'preview shortened',
    'export.building': 'Building…',

    'monitors.title': 'Watch list',
    'monitors.lede':
      'IPChek re-checks each country on the schedule you set and records every change with the exact time it was seen.',
    'monitors.addTitle': 'Add a country to watch',
    'monitors.add': 'Watch it',
    'monitors.every': 'Check every',
    'monitors.defaultInterval': 'Default ({n})',
    'monitors.hours': '{n} hours',
    'monitors.hour': 'Every hour',
    'monitors.minutes': '{n} minutes',
    'monitors.empty': 'Nothing on watch yet. Add a country above.',
    'monitors.colCountry': 'Country',
    'monitors.colSource': 'Source',
    'monitors.colFamily': 'Family',
    'monitors.colRanges': 'Current ranges',
    'monitors.colChecked': 'Last checked',
    'monitors.colChanged': 'Last change',
    'monitors.colStatus': 'Status',
    'monitors.paused': 'Paused',
    'monitors.active': 'Active',
    'monitors.pause': 'Pause',
    'monitors.resume': 'Resume',
    'monitors.remove': 'Remove',
    'monitors.removeConfirm': 'Stop watching {c}?',
    'monitors.added': 'Now watching {c}',
    'monitors.removed': 'Stopped watching {c}',
    'monitors.checked': '{c}: {r}',
    'monitors.resultUnchanged': 'no change',
    'monitors.resultChanged': '{a} added, {r} removed',
    'monitors.resultBaseline': 'baseline recorded',

    'changes.title': 'Change history',
    'changes.lede': 'Every difference IPChek has seen, newest first, with the exact date and time it was detected.',
    'changes.type': 'Kind',
    'changes.allTypes': 'Everything',
    'changes.typeChange': 'Changes',
    'changes.typeBaseline': 'Baselines',
    'changes.typeError': 'Errors',
    'changes.refresh': 'Refresh',
    'changes.loadMore': 'Load more',
    'changes.allCountries': 'All countries',
    'changes.empty': 'No history yet. Watch a country and changes will show up here.',
    'changes.added': 'added',
    'changes.removed': 'removed',
    'changes.baseline': 'First recording',
    'changes.error': 'Check failed',
    'changes.reorganised': 'Same coverage, different prefixes',
    'changes.detailTitle': 'What changed',
    'changes.addedBlocks': 'Newly covered',
    'changes.removedBlocks': 'No longer covered',
    'changes.showing': 'showing {n} of {t}',
    'changes.prefixCount': 'Prefix count',
    'changes.addressCount': 'Address count',
    'changes.detectedAt': 'Detected at',
    'changes.nothingElse': 'That is everything.',
    'changes.msgBaseline': 'First recording — {n} prefixes stored',
    'changes.msgChange': '{a} blocks added, {r} blocks removed',
    'changes.msgReorg': 'Same address space, split into different prefixes',
    'changes.currentPrefixes': 'Prefixes recorded',

    'about.title': 'Setup and sources',
    'about.lede': 'Where the data comes from, how often it refreshes, and how to get alerts.',
    'about.sources': 'Data sources',
    'about.schedule': 'Schedule',
    'about.notifications': 'Alerts',
    'about.notificationsBody':
      'Set the matching values in your .env file and restart. IPChek posts a summary of every change to whichever channels are configured.',
    'about.testNotify': 'Send a test alert',
    'about.notifyOff': 'not configured',
    'about.notifyOn': 'ready',
    'about.testSent': 'Test alert sent via {c}',
    'about.testNone': 'No alert channel is configured yet',
    'about.intervalLabel': 'Default check interval',
    'about.everyMinutes': 'every {n} minutes',
    'about.schedulerOff': 'Automatic checks are off',
    'about.formats': 'Supported devices',
    'about.formatsBody': '{n} output formats, from RouterOS scripts to nftables sets.',
    'about.footerNote': 'Ranges are published by the registries — always verify before blocking production traffic.',
    'about.apiTitle': 'API',
    'about.apiBody': 'Every screen here is backed by a plain HTTP API your own scripts can call.',
  },

  fa: {
    'tab.overview': 'نمای کلی',
    'tab.countries': 'کشورها',
    'tab.export': 'خروجی',
    'tab.monitors': 'فهرست پایش',
    'tab.changes': 'تغییرات',
    'tab.about': 'راه‌اندازی',

    'common.country': 'کشور',
    'common.source': 'منبع داده',
    'common.family': 'نوع آدرس',
    'common.bothFamilies': 'IPv4 و IPv6',
    'common.prefixes': 'پیشوند',
    'common.addresses': 'آدرس',
    'common.never': 'هیچ‌وقت',
    'common.loading': 'در حال بارگذاری…',
    'common.cancel': 'انصراف',
    'common.close': 'بستن',
    'common.copied': 'در حافظه کپی شد',
    'common.copyFailed': 'کپی نشد — متن را انتخاب و دستی کپی کنید',
    'common.error': 'مشکلی پیش آمد',
    'common.watch': 'پایش کن',
    'common.watching': 'در حال پایش',
    'common.unwatch': 'توقف پایش',
    'common.checkNow': 'همین حالا بررسی کن',
    'common.open': 'باز کن',
    'common.retry': 'دوباره تلاش کن',

    'overview.watching': 'تحت پایش',
    'overview.atAGlance': 'یک نگاه',
    'overview.recent': 'تغییرات اخیر',
    'overview.emptyTitle': 'هنوز کشوری تحت پایش نیست',
    'overview.emptyBody': 'یک کشور را انتخاب کنید؛ IPChek محدوده‌هایش را ثبت می‌کند و به‌محض تغییر به شما خبر می‌دهد.',
    'overview.emptyCta': 'انتخاب کشور',
    'overview.lastChange': 'آخرین تغییر',
    'overview.lastCheck': 'آخرین بررسی',
    'overview.noChangeYet': 'از زمان ثبت اولیه تغییری نبوده',
    'overview.statCountries': 'کشورهای ثبت‌شده',
    'overview.statPrefixes': 'پیشوندهای ذخیره‌شده',
    'overview.statChanges': 'تغییرات ۷ روز اخیر',
    'overview.statWatches': 'پایش‌های فعال',
    'overview.statFailing': 'ناموفق',
    'overview.nextCheck': 'بررسی بعدی',

    'countries.title': 'همه کشورها، محدوده‌های فعلی',
    'countries.lede':
      'محدوده‌ها مستقیم از منبعی که انتخاب می‌کنید گرفته و بار اول ذخیره می‌شوند. روی هر کشور بزنید تا ببینید فضای آدرسش کجاست.',
    'countries.search': 'جست‌وجو',
    'countries.searchPlaceholder': 'ایران، IR، Iran…',
    'countries.region': 'قاره',
    'countries.allRegions': 'همه قاره‌ها',
    'countries.onlyWatched': 'فقط تحت پایش',
    'countries.none': 'کشوری با این جست‌وجو پیدا نشد.',
    'countries.count': '{n} کشور',

    'detail.spaceMap': 'آدرس‌هایش کجا هستند',
    'detail.spaceMapHint':
      'هر ستون یک بلوک ‎/8‎ از فضای IPv4 است؛ از ‎0.0.0.0‎ در چپ تا ‎255.0.0.0‎ در راست. ستون بلندتر یعنی سهم بیشتر از آن بلوک.',
    'detail.spaceMapHintV6': 'ستون‌ها محدوده جهانی IPv6 یعنی ‎2000::/3‎ را از چپ به راست تقسیم می‌کنند.',
    'detail.notFetched': 'هنوز دریافت نشده',
    'detail.fetchNow': 'دریافت محدوده‌ها',
    'detail.exportThis': 'خروجی این لیست',
    'detail.recentEvents': 'تاریخچه',
    'detail.noEvents': 'هنوز تاریخچه‌ای ثبت نشده.',
    'detail.published': 'انتشار در منبع',
    'detail.stored': 'ذخیره در اینجا',

    'export.title': 'ساخت پیکربندی برای دستگاه شما',
    'export.lede':
      'کشور و دستگاه را انتخاب کنید. IPChek پیکربندی آماده‌ی چسباندن را می‌سازد، یا آدرسی می‌دهد که خود دستگاه طبق زمان‌بندی بگیرد.',
    'export.format': 'دستگاه / قالب',
    'export.listName': 'نام لیست روی دستگاه',
    'export.action': 'قوانین باید',
    'export.actionBlock': 'این کشور را مسدود کنند',
    'export.actionAllow': 'این کشور را مجاز کنند',
    'export.aggregate': 'ادغام بلوک‌های مجاور (قوانین کمتر، پوشش یکسان)',
    'export.preview': 'پیش‌نمایش',
    'export.download': 'دانلود فایل',
    'export.copy': 'کپی پیکربندی',
    'export.copyShort': 'کپی',
    'export.refresh': 'دریافت دوباره از منبع',
    'export.liveUrl': 'آدرس زنده',
    'export.liveUrlHint': 'این آدرس را به دستگاه بدهید تا خودش به‌روز بماند. همیشه لیست فعلی را می‌دهد.',
    'export.lines': '{n} پیشوند · {a}',
    'export.truncated': 'پیش‌نمایش کوتاه شده',
    'export.building': 'در حال ساخت…',

    'monitors.title': 'فهرست پایش',
    'monitors.lede':
      'IPChek هر کشور را طبق زمان‌بندی شما دوباره بررسی می‌کند و هر تغییر را با زمان دقیق مشاهده ثبت می‌کند.',
    'monitors.addTitle': 'افزودن کشور به پایش',
    'monitors.add': 'پایش کن',
    'monitors.every': 'بررسی هر',
    'monitors.defaultInterval': 'پیش‌فرض ({n})',
    'monitors.hours': '{n} ساعت',
    'monitors.hour': 'هر ساعت',
    'monitors.minutes': '{n} دقیقه',
    'monitors.empty': 'هنوز کشوری تحت پایش نیست. از بالا یکی اضافه کنید.',
    'monitors.colCountry': 'کشور',
    'monitors.colSource': 'منبع',
    'monitors.colFamily': 'نوع',
    'monitors.colRanges': 'محدوده‌های فعلی',
    'monitors.colChecked': 'آخرین بررسی',
    'monitors.colChanged': 'آخرین تغییر',
    'monitors.colStatus': 'وضعیت',
    'monitors.paused': 'متوقف',
    'monitors.active': 'فعال',
    'monitors.pause': 'توقف',
    'monitors.resume': 'ادامه',
    'monitors.remove': 'حذف',
    'monitors.removeConfirm': 'پایش {c} متوقف شود؟',
    'monitors.added': 'پایش {c} شروع شد',
    'monitors.removed': 'پایش {c} متوقف شد',
    'monitors.checked': '{c}: {r}',
    'monitors.resultUnchanged': 'بدون تغییر',
    'monitors.resultChanged': '{a} افزوده، {r} حذف',
    'monitors.resultBaseline': 'ثبت اولیه انجام شد',

    'changes.title': 'تاریخچه تغییرات',
    'changes.lede': 'همه تفاوت‌هایی که IPChek دیده، از جدید به قدیم، همراه با تاریخ و ساعت دقیق تشخیص.',
    'changes.type': 'نوع',
    'changes.allTypes': 'همه',
    'changes.typeChange': 'تغییرها',
    'changes.typeBaseline': 'ثبت اولیه',
    'changes.typeError': 'خطاها',
    'changes.refresh': 'تازه‌سازی',
    'changes.loadMore': 'موارد بیشتر',
    'changes.allCountries': 'همه کشورها',
    'changes.empty': 'هنوز تاریخچه‌ای نیست. یک کشور را پایش کنید تا تغییرات اینجا بیاید.',
    'changes.added': 'افزوده',
    'changes.removed': 'حذف',
    'changes.baseline': 'اولین ثبت',
    'changes.error': 'بررسی ناموفق',
    'changes.reorganised': 'پوشش یکسان، پیشوندهای متفاوت',
    'changes.detailTitle': 'چه چیزی تغییر کرد',
    'changes.addedBlocks': 'تازه اضافه‌شده',
    'changes.removedBlocks': 'دیگر پوشش داده نمی‌شود',
    'changes.showing': 'نمایش {n} از {t}',
    'changes.prefixCount': 'تعداد پیشوند',
    'changes.addressCount': 'تعداد آدرس',
    'changes.detectedAt': 'زمان تشخیص',
    'changes.nothingElse': 'همه موارد نمایش داده شد.',
    'changes.msgBaseline': 'اولین ثبت — {n} پیشوند ذخیره شد',
    'changes.msgChange': '{a} بلوک افزوده، {r} بلوک حذف شد',
    'changes.msgReorg': 'همان فضای آدرس، با تقسیم‌بندی متفاوت پیشوندها',
    'changes.currentPrefixes': 'پیشوندهای ثبت‌شده',

    'about.title': 'راه‌اندازی و منابع',
    'about.lede': 'داده از کجا می‌آید، هر چند وقت تازه می‌شود و چطور هشدار بگیرید.',
    'about.sources': 'منابع داده',
    'about.schedule': 'زمان‌بندی',
    'about.notifications': 'هشدارها',
    'about.notificationsBody':
      'مقادیر مربوطه را در فایل ‎.env‎ تنظیم و سرویس را دوباره اجرا کنید. IPChek خلاصه هر تغییر را به کانال‌های تنظیم‌شده می‌فرستد.',
    'about.testNotify': 'ارسال هشدار آزمایشی',
    'about.notifyOff': 'تنظیم نشده',
    'about.notifyOn': 'آماده',
    'about.testSent': 'هشدار آزمایشی از طریق {c} ارسال شد',
    'about.testNone': 'هنوز هیچ کانال هشداری تنظیم نشده',
    'about.intervalLabel': 'فاصله پیش‌فرض بررسی',
    'about.everyMinutes': 'هر {n} دقیقه',
    'about.schedulerOff': 'بررسی خودکار خاموش است',
    'about.formats': 'دستگاه‌های پشتیبانی‌شده',
    'about.formatsBody': '{n} قالب خروجی، از اسکریپت RouterOS تا ست‌های nftables.',
    'about.footerNote': 'محدوده‌ها را ریجیستری‌ها منتشر می‌کنند — پیش از اعمال روی ترافیک واقعی حتماً بررسی کنید.',
    'about.apiTitle': 'رابط برنامه‌نویسی',
    'about.apiBody': 'پشت هر صفحه اینجا یک API ساده HTTP هست که اسکریپت‌های خودتان هم می‌توانند صدا بزنند.',
  },
};

export const LOCALES = Object.keys(STRINGS);

let current = localStorage.getItem('ipchek.lang') || (navigator.language?.startsWith('fa') ? 'fa' : 'en');
if (!LOCALES.includes(current)) current = 'en';

export const getLocale = () => current;
export const isRtl = () => current === 'fa';

export function setLocale(locale) {
  current = LOCALES.includes(locale) ? locale : 'en';
  localStorage.setItem('ipchek.lang', current);
  document.documentElement.lang = current;
  document.body.dir = isRtl() ? 'rtl' : 'ltr';
}

/** `t('monitors.hours', { n: 6 })` — missing keys fall back to English, then to the key. */
export function t(key, vars) {
  let text = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, value);
    }
  }
  return text;
}

/** Apply translations to every element carrying data-t / data-t-ph. */
export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll('[data-t]')) {
    node.textContent = t(node.dataset.t);
  }
  for (const node of root.querySelectorAll('[data-t-ph]')) {
    node.placeholder = t(node.dataset.tPh);
  }
}

/* ------------------------------------------------------------ formatting */

/** Local date and time, to the second — the "exact moment" the UI promises. */
export function formatStamp(iso) {
  if (!iso) return t('common.never');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

const RELATIVE_UNITS = [
  [31536000, 'year'],
  [2592000, 'month'],
  [604800, 'week'],
  [86400, 'day'],
  [3600, 'hour'],
  [60, 'minute'],
  [1, 'second'],
];

export function formatRelative(iso) {
  if (!iso) return t('common.never');
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(current, { numeric: 'auto' });
  for (const [size, unit] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return formatter.format(-Math.round(seconds / size), unit);
    }
  }
  return '';
}

/**
 * Latin digits in both languages on purpose: every number here sits beside an
 * IP address or a prefix length, and mixing digit systems in one table makes
 * technical data harder to scan.
 */
export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}
