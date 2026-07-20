const COPY = Object.freeze({
  en: Object.freeze({
    checkingTitle: 'Checking receipt',
    checkingBody: 'Validating this local contribution.',
    previewTitle: 'Completion receipt',
    successTitle: '+3 added',
    successBody: 'Beacon District now includes this contribution.',
    emptyTitle: 'No contributions yet',
    emptyBody: 'Valid receipts will appear here.',
    ledgerTitle: 'Contribution ledger',
    ledgerLimit: 'Stored on this device · up to 24',
    addAction: 'Add +3',
    retryAction: 'Try again',
    backAction: 'Back to realm',
    invalidTitle: 'Receipt unavailable',
    invalidBody: 'This receipt can’t be used.',
    mismatchTitle: 'Different realm',
    mismatchBody: 'This receipt belongs to another realm.',
    duplicateTitle: 'Already added',
    duplicateBody: 'This receipt was already added.',
    fullTitle: 'Ledger full',
    fullBody: 'This device already stores 24 contributions.',
    storageTitle: 'Save failed',
    storageBody: 'Couldn’t save the contribution.',
    mission: 'Mission',
    role: 'Role',
    route: 'Route',
    district: 'District',
    contribution: 'Contribution',
    total: 'Realm total',
    localOnly: 'Local prototype record',
    missions: Object.freeze({
      'route-choice': 'Choose a Route',
      'relay-sequence': 'Link the Relays',
      'signal-match': 'Match the Signal',
    }),
    roles: Object.freeze({ builder: 'Builder', explorer: 'Explorer', guardian: 'Guardian' }),
    routes: Object.freeze({ sky: 'Sky route', ocean: 'Ocean route' }),
    districts: Object.freeze({ 'beacon-district': 'Beacon District' }),
  }),
  ar: Object.freeze({
    checkingTitle: 'التحقق من الإيصال',
    checkingBody: 'جارٍ التحقق من هذه المساهمة المحلية.',
    previewTitle: 'إيصال إنجاز',
    successTitle: 'تمت إضافة +3',
    successBody: 'أصبحت هذه المساهمة ضمن حيّ المنارة.',
    emptyTitle: 'لا مساهمات بعد',
    emptyBody: 'ستظهر الإيصالات الصالحة هنا.',
    ledgerTitle: 'سجل المساهمات',
    ledgerLimit: 'محفوظ على هذا الجهاز · حتى 24',
    addAction: 'أضف +3',
    retryAction: 'حاول مجددًا',
    backAction: 'العودة إلى العالم',
    invalidTitle: 'الإيصال غير متاح',
    invalidBody: 'لا يمكن استخدام هذا الإيصال.',
    mismatchTitle: 'عالم مختلف',
    mismatchBody: 'هذا الإيصال تابع لعالم آخر.',
    duplicateTitle: 'تمت إضافته',
    duplicateBody: 'تمت إضافة هذا الإيصال سابقًا.',
    fullTitle: 'السجل ممتلئ',
    fullBody: 'يحفظ هذا الجهاز 24 مساهمة بالفعل.',
    storageTitle: 'تعذّر الحفظ',
    storageBody: 'تعذّر حفظ المساهمة.',
    mission: 'المهمة',
    role: 'الدور',
    route: 'المسار',
    district: 'المنطقة',
    contribution: 'المساهمة',
    total: 'إجمالي العالم',
    localOnly: 'سجل تجريبي محلي',
    missions: Object.freeze({
      'route-choice': 'اختر مسارًا',
      'relay-sequence': 'اربط المرحّلات',
      'signal-match': 'طابق الإشارة',
    }),
    roles: Object.freeze({ builder: 'البنّاء', explorer: 'المستكشف', guardian: 'الحارس' }),
    routes: Object.freeze({ sky: 'المسار السماوي', ocean: 'المسار البحري' }),
    districts: Object.freeze({ 'beacon-district': 'حيّ المنارة' }),
  }),
});

function normalizeLocale(locale) {
  return String(locale || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getCompletionReceiptCopy(locale = 'en') {
  return COPY[normalizeLocale(locale)];
}

function keyShape(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? keyShape(child, path) : [path];
  }).sort();
}

export function getCompletionReceiptKeySets() {
  return Object.freeze({ en: keyShape(COPY.en), ar: keyShape(COPY.ar) });
}
