const COPY = Object.freeze({
  en: Object.freeze({
    kicker: 'Saved realm operation',
    title: 'Launch next mission',
    support: 'Continue this realm without changing its progress.',
    energy: 'Energy',
    contributions: 'Contributions',
    launch: 'Launch next mission',
    create: 'Create invite',
    creating: 'Creating…',
    cancel: 'Cancel',
    readyTitle: 'Invite ready',
    readySupport: 'Progress changes only after a valid receipt returns.',
    share: 'Share invite',
    copy: 'Copy invite',
    sharing: 'Sharing…',
    copying: 'Copying…',
    shared: 'Invite shared.',
    copied: 'Invite copied.',
    denied: 'Sharing was denied. Copy the invite instead.',
    cancelled: 'Sharing was cancelled.',
    failed: 'The invite is safe. Try again.',
    manual: 'Copy this invite link.',
    retry: 'Try again',
    invalidTitle: 'Realm unavailable',
    invalidBody: 'Saved realm data could not be restored safely.',
    unavailableTitle: 'One realm required',
    unavailableBody: 'Continue after one valid local realm is saved.',
    fullTitle: 'Mission limit reached',
    fullBody: 'No more local mission records can be added.',
    storageTitle: 'Invite not saved',
    storageBody: 'Nothing changed. Try creating the invite again.',
    disabled: 'Choose one mission and one availability window.',
    recovery: 'Return to realm',
    operationLabel: 'Next mission operation',
    stampLabel: 'New mission invite',
  }),
  ar: Object.freeze({
    kicker: 'عملية العالم المحفوظ',
    title: 'أطلق المهمة التالية',
    support: 'تابع هذا العالم دون تغيير تقدمه.',
    energy: 'الطاقة',
    contributions: 'المساهمات',
    launch: 'أطلق المهمة التالية',
    create: 'أنشئ الدعوة',
    creating: 'جارٍ الإنشاء…',
    cancel: 'إلغاء',
    readyTitle: 'الدعوة جاهزة',
    readySupport: 'لا يتغير التقدم إلا بعد عودة إيصال صالح.',
    share: 'شارك الدعوة',
    copy: 'انسخ الدعوة',
    sharing: 'جارٍ المشاركة…',
    copying: 'جارٍ النسخ…',
    shared: 'تمت مشاركة الدعوة.',
    copied: 'تم نسخ الدعوة.',
    denied: 'رُفضت المشاركة. انسخ الدعوة بدلًا منها.',
    cancelled: 'أُلغيت المشاركة.',
    failed: 'الدعوة آمنة. حاول مجددًا.',
    manual: 'انسخ رابط الدعوة هذا.',
    retry: 'حاول مجددًا',
    invalidTitle: 'العالم غير متاح',
    invalidBody: 'تعذر استعادة بيانات العالم المحفوظ بأمان.',
    unavailableTitle: 'يلزم عالم واحد',
    unavailableBody: 'تابع بعد حفظ عالم محلي صالح واحد.',
    fullTitle: 'بلغت حد المهام',
    fullBody: 'لا يمكن إضافة سجلات مهام محلية أخرى.',
    storageTitle: 'لم تُحفظ الدعوة',
    storageBody: 'لم يتغير شيء. حاول إنشاء الدعوة مجددًا.',
    disabled: 'اختر مهمة ومدة إتاحة واحدة.',
    recovery: 'ارجع إلى العالم',
    operationLabel: 'عملية المهمة التالية',
    stampLabel: 'دعوة مهمة جديدة',
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

export function normalizeRealmContinuationLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getRealmContinuationCopy(locale) {
  return COPY[normalizeRealmContinuationLocale(locale)];
}

export function getRealmContinuationKeySets() {
  return Object.freeze({
    en: Object.freeze(keyPaths(COPY.en)),
    ar: Object.freeze(keyPaths(COPY.ar)),
  });
}
