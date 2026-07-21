const copy = Object.freeze({
  en: Object.freeze({
    selectorLegend: 'Mission availability',
    selectorValidation: 'Choose one mission window.',
    options: Object.freeze({
      'now-1h': 'Open now · 1 hour',
      'now-24h': 'Open now · 24 hours',
      'in-1h-24h': 'Starts in 1h · open 24h',
    }),
    upcomingTitle: 'Opens soon',
    startsAt: 'Starts {time}',
    checkAgain: 'Check again',
    checking: 'Checking…',
    expiredTitle: 'Invite expired',
    expiredSupport: 'This mission is no longer available.',
    invalidTitle: 'Invite unavailable',
    invalidSupport: 'This invite cannot be opened.',
    errorTitle: 'Check unavailable',
    errorSupport: 'Try checking this mission again.',
    tryAgain: 'Try again',
    back: 'Back',
    transitionActive: 'Mission is now open.',
    transitionExpired: 'Mission is no longer available.',
  }),
  ar: Object.freeze({
    selectorLegend: 'إتاحة المهمة',
    selectorValidation: 'اختر مدة إتاحة واحدة.',
    options: Object.freeze({
      'now-1h': 'متاحة الآن · ساعة',
      'now-24h': 'متاحة الآن · 24 ساعة',
      'in-1h-24h': 'تبدأ بعد ساعة · متاحة 24 ساعة',
    }),
    upcomingTitle: 'تبدأ قريبًا',
    startsAt: 'تبدأ {time}',
    checkAgain: 'تحقق مجددًا',
    checking: 'جارٍ التحقق…',
    expiredTitle: 'انتهت الدعوة',
    expiredSupport: 'لم تعد هذه المهمة متاحة.',
    invalidTitle: 'الدعوة غير متاحة',
    invalidSupport: 'تعذر فتح هذه الدعوة.',
    errorTitle: 'تعذر التحقق',
    errorSupport: 'حاول التحقق من المهمة مجددًا.',
    tryAgain: 'حاول مجددًا',
    back: 'رجوع',
    transitionActive: 'أصبحت المهمة متاحة الآن.',
    transitionExpired: 'لم تعد المهمة متاحة.',
  }),
});

function keyPaths(value, prefix = '') {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === 'object' && !Array.isArray(nested)
      ? keyPaths(nested, path)
      : [path];
  }).sort();
}

export function normalizeMissionScheduleLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getMissionScheduleCopy(locale) {
  return copy[normalizeMissionScheduleLocale(locale)];
}

export function getMissionScheduleKeySets() {
  return Object.freeze({
    en: Object.freeze(keyPaths(copy.en)),
    ar: Object.freeze(keyPaths(copy.ar)),
  });
}
