/** Copy that only the server-free build needs, merged into the shared i18n. */
export const WEB_STRINGS = {
  en: {
    'web.tagline': 'Country IP ranges, ready for your router',
    'web.lede':
      'Pick a country and a device, get the config. Everything runs in this page — the ranges are fetched straight from the source and nothing is sent anywhere.',
    'web.noServer': 'No server',
    'web.step1': 'Which country',
    'web.step2': 'Which device',
    'web.step3': 'Your config',
    'web.fetching': 'Fetching ranges…',
    'web.downloading': 'Downloading the database…',
    'web.parsing': 'Reading the database…',
    'web.fetchFailed': 'Could not fetch the ranges',
    'web.fetchFailedHint':
      'The source may be temporarily unreachable, or your network may block raw.githubusercontent.com. Try the other source, or run the self-hosted version.',
    'web.retry': 'Try again',
    'web.emptyFamily': 'This country has no IPv{f} allocations in this source.',
    'web.summary': '{n} prefixes · {a}',
    'web.fetchedIn': 'fetched in {ms} ms',
    'web.sourceWeight': 'downloads {w}',
    'web.heavyWarning': 'DB-IP downloads about 10 MB the first time. It is kept in memory afterwards.',

    'web.snapshotTitle': 'Watch this list for changes',
    'web.snapshotBody':
      'Save the current list, then come back later and compare. The comparison happens here in your browser, so it only runs when you open this page.',
    'web.snapshotScheduled':
      'For checks on a timer with Telegram alerts, run the self-hosted version — it is the same project.',
    'web.save': 'Save this list',
    'web.saved': 'Saved · {d}',
    'web.resave': 'Replace saved list',
    'web.forget': 'Forget',
    'web.noSnapshot': 'Nothing saved for this country yet.',
    'web.unchangedSince': 'No change since {d}',
    'web.changedSince': 'Changed since {d}',
    'web.savedOk': 'List saved in this browser',
    'web.forgotten': 'Saved list removed',
    'web.storageFull': 'Browser storage is full — remove a saved list first',

    'web.selfHosted': 'Self-hosted version',
    'web.selfHostedBody':
      'Scheduled checks, Telegram and webhook alerts, change history, and a stable URL your router can fetch on its own.',
    'web.sourceNote': 'The registry files are not available here',
    'web.sourceNoteBody':
      'The RIR delegation servers send no CORS headers, so a web page cannot read them. The sources below carry the same allocation data. The self-hosted version reads the registry files directly.',
    'web.viewOnGitHub': 'View on GitHub',
  },

  fa: {
    'web.tagline': 'محدوده‌های IP هر کشور، آماده برای روتر شما',
    'web.lede':
      'کشور و دستگاه را انتخاب کنید، پیکربندی را بگیرید. همه‌چیز داخل همین صفحه اجرا می‌شود — محدوده‌ها مستقیم از منبع گرفته می‌شوند و هیچ داده‌ای جایی فرستاده نمی‌شود.',
    'web.noServer': 'بدون سرور',
    'web.step1': 'کدام کشور',
    'web.step2': 'کدام دستگاه',
    'web.step3': 'پیکربندی شما',
    'web.fetching': 'در حال گرفتن محدوده‌ها…',
    'web.downloading': 'در حال دانلود پایگاه داده…',
    'web.parsing': 'در حال خواندن پایگاه داده…',
    'web.fetchFailed': 'محدوده‌ها گرفته نشد',
    'web.fetchFailedHint':
      'ممکن است منبع موقتاً در دسترس نباشد یا شبکه‌ی شما raw.githubusercontent.com را مسدود کند. منبع دیگر را امتحان کنید یا نسخه‌ی خودمیزبان را اجرا کنید.',
    'web.retry': 'دوباره تلاش کن',
    'web.emptyFamily': 'این کشور در این منبع تخصیص IPv{f} ندارد.',
    'web.summary': '{n} پیشوند · {a}',
    'web.fetchedIn': 'در {ms} میلی‌ثانیه',
    'web.sourceWeight': 'حجم دانلود: {w}',
    'web.heavyWarning': 'DB-IP بار اول حدود ۱۰ مگابایت دانلود می‌کند و بعد در حافظه نگه داشته می‌شود.',

    'web.snapshotTitle': 'این لیست را برای تغییر زیر نظر بگیرید',
    'web.snapshotBody':
      'لیست فعلی را ذخیره کنید، بعداً برگردید و مقایسه کنید. مقایسه داخل مرورگر خودتان انجام می‌شود، پس فقط وقتی این صفحه را باز کنید اجرا می‌شود.',
    'web.snapshotScheduled':
      'برای بررسی زمان‌بندی‌شده و هشدار تلگرام، نسخه‌ی خودمیزبان را اجرا کنید — همین پروژه است.',
    'web.save': 'ذخیره این لیست',
    'web.saved': 'ذخیره‌شده · {d}',
    'web.resave': 'جایگزینی لیست ذخیره‌شده',
    'web.forget': 'حذف',
    'web.noSnapshot': 'هنوز چیزی برای این کشور ذخیره نشده.',
    'web.unchangedSince': 'از {d} تغییری نکرده',
    'web.changedSince': 'از {d} تغییر کرده',
    'web.savedOk': 'لیست در همین مرورگر ذخیره شد',
    'web.forgotten': 'لیست ذخیره‌شده حذف شد',
    'web.storageFull': 'حافظه مرورگر پر است — اول یک لیست ذخیره‌شده را حذف کنید',

    'web.selfHosted': 'نسخه خودمیزبان',
    'web.selfHostedBody':
      'بررسی زمان‌بندی‌شده، هشدار تلگرام و وب‌هوک، تاریخچه تغییرات، و آدرس ثابتی که روتر خودش بگیرد.',
    'web.sourceNote': 'فایل‌های ریجیستری اینجا در دسترس نیستند',
    'web.sourceNoteBody':
      'سرورهای تخصیص RIR هدر CORS نمی‌فرستند، پس یک صفحه وب نمی‌تواند آن‌ها را بخواند. منابع زیر همان داده تخصیص را دارند. نسخه خودمیزبان مستقیم فایل‌های ریجیستری را می‌خواند.',
    'web.viewOnGitHub': 'مشاهده در گیت‌هاب',
  },
};
