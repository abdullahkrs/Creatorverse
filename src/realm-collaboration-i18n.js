const COPY = Object.freeze({
  en: Object.freeze({
    action: 'Collaborate',
    title: 'Connect two realms',
    support: 'Create one local proposal from this saved realm.',
    sourceLabel: 'Source realm',
    localLabel: 'Your realm',
    relationshipLabel: 'Proposal from link',
    create: 'Create proposal',
    creating: 'Creating…',
    share: 'Share proposal',
    copy: 'Copy proposal',
    sharing: 'Sharing…',
    copying: 'Copying…',
    shared: 'Proposal shared.',
    copied: 'Proposal copied.',
    cancelled: 'Sharing cancelled.',
    denied: 'Sharing denied. Copy instead.',
    failed: 'Proposal kept locally. Try again.',
    manual: 'Copy this proposal link.',
    retry: 'Try again',
    close: 'Close',
    previewTitle: 'Review realm link',
    previewSupport: 'Check both fictional realms before accepting.',
    accept: 'Accept link',
    accepting: 'Accepting…',
    linkedTitle: 'Collaboration linked',
    linkedSupport: 'Saved locally on this device.',
    remove: 'Remove link',
    confirmTitle: 'Remove collaboration?',
    confirmSupport: 'Only this local link will be removed.',
    keep: 'Keep',
    confirmRemove: 'Remove',
    removed: 'Collaboration removed.',
    duplicate: 'This collaboration is already linked.',
    selfTitle: 'Different realm required',
    selfSupport: 'A realm cannot link to itself.',
    alreadyTitle: 'One link already exists',
    alreadySupport: 'Remove the current link before adding another.',
    invalidTitle: 'Proposal unavailable',
    invalidSupport: 'This proposal could not be opened safely.',
    noRealmTitle: 'Create a realm first',
    noRealmSupport: 'A valid local realm is required to review this link.',
    storageTitle: 'Link not saved',
    storageSupport: 'Nothing changed. Try again.',
    back: 'Back to realm',
    viewCurrent: 'View current link',
    createRealm: 'Create realm',
    cosmic: 'Signal realm',
    wild: 'Canopy realm',
    future: 'Circuit realm',
  }),
  ar: Object.freeze({
    action: 'تعاون',
    title: 'اربط عالمين',
    support: 'أنشئ مقترحًا محليًا واحدًا من هذا العالم المحفوظ.',
    sourceLabel: 'العالم المصدر',
    localLabel: 'عالمك',
    relationshipLabel: 'مقترح من رابط',
    create: 'أنشئ المقترح',
    creating: 'جارٍ الإنشاء…',
    share: 'شارك المقترح',
    copy: 'انسخ المقترح',
    sharing: 'جارٍ المشاركة…',
    copying: 'جارٍ النسخ…',
    shared: 'تمت مشاركة المقترح.',
    copied: 'تم نسخ المقترح.',
    cancelled: 'أُلغيت المشاركة.',
    denied: 'رُفضت المشاركة. انسخه بدلًا منها.',
    failed: 'بقي المقترح محليًا. حاول مجددًا.',
    manual: 'انسخ رابط المقترح هذا.',
    retry: 'حاول مجددًا',
    close: 'إغلاق',
    previewTitle: 'راجع رابط العالم',
    previewSupport: 'تحقق من العالمين الخياليين قبل القبول.',
    accept: 'اقبل الربط',
    accepting: 'جارٍ القبول…',
    linkedTitle: 'التعاون مرتبط',
    linkedSupport: 'محفوظ محليًا على هذا الجهاز.',
    remove: 'أزل الربط',
    confirmTitle: 'إزالة التعاون؟',
    confirmSupport: 'سيُزال هذا الرابط المحلي فقط.',
    keep: 'إبقاء',
    confirmRemove: 'إزالة',
    removed: 'تمت إزالة التعاون.',
    duplicate: 'هذا التعاون مرتبط بالفعل.',
    selfTitle: 'يلزم عالم مختلف',
    selfSupport: 'لا يمكن ربط العالم بنفسه.',
    alreadyTitle: 'يوجد رابط واحد',
    alreadySupport: 'أزل الرابط الحالي قبل إضافة آخر.',
    invalidTitle: 'المقترح غير متاح',
    invalidSupport: 'تعذر فتح هذا المقترح بأمان.',
    noRealmTitle: 'أنشئ عالمًا أولًا',
    noRealmSupport: 'يلزم عالم محلي صالح لمراجعة هذا الرابط.',
    storageTitle: 'لم يُحفظ الرابط',
    storageSupport: 'لم يتغير شيء. حاول مجددًا.',
    back: 'ارجع إلى العالم',
    viewCurrent: 'اعرض الرابط الحالي',
    createRealm: 'أنشئ عالمًا',
    cosmic: 'عالم الإشارة',
    wild: 'عالم الغابة',
    future: 'عالم الدائرة',
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

export function normalizeRealmCollaborationLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getRealmCollaborationCopy(locale) {
  return COPY[normalizeRealmCollaborationLocale(locale)];
}

export function getRealmCollaborationKeySets() {
  return Object.freeze({
    en: Object.freeze(keyPaths(COPY.en)),
    ar: Object.freeze(keyPaths(COPY.ar)),
  });
}
