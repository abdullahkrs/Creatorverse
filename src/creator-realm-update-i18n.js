const COPY = Object.freeze({
  en: Object.freeze({
    kicker: 'Fictional realm update',
    title: 'Realm signal updated',
    waitingTitle: 'Realm signal waiting',
    waitingBody: 'Add one valid contribution to share an update.',
    changeTemplate: '{district} now holds {total} energy.',
    contributions: 'Contributions',
    energy: 'Realm energy',
    shareAction: 'Share update',
    copyAction: 'Copy update',
    sharing: 'Sharing…',
    copying: 'Copying…',
    shared: 'Update shared.',
    copied: 'Update copied.',
    cancelled: 'Share cancelled. Try again.',
    denied: 'Sharing was blocked. Copy the update manually.',
    failed: 'Couldn’t share. Copy the update manually.',
    unsupported: 'Copy isn’t available. Select the update below.',
    invalid: 'Realm update unavailable.',
    manualLabel: 'Manual copy',
    shareTitle: 'Creatorverse realm update',
    payloadTemplate: '{archetype} · {district}. Contributions: {count} · Energy: {total}.',
    archetypes: Object.freeze({
      cosmic: 'Starforge Realm',
      wild: 'Verdant Realm',
      future: 'Signal Realm',
    }),
    districts: Object.freeze({ 'beacon-district': 'Beacon District' }),
  }),
  ar: Object.freeze({
    kicker: 'تحديث عالم خيالي',
    title: 'تم تحديث إشارة العالم',
    waitingTitle: 'إشارة العالم بانتظار مساهمة',
    waitingBody: 'أضف مساهمة صالحة واحدة لمشاركة التحديث.',
    changeTemplate: 'طاقة {district} الآن {total}.',
    contributions: 'المساهمات',
    energy: 'طاقة العالم',
    shareAction: 'شارك التحديث',
    copyAction: 'انسخ التحديث',
    sharing: 'جارٍ المشاركة…',
    copying: 'جارٍ النسخ…',
    shared: 'تمت مشاركة التحديث.',
    copied: 'تم نسخ التحديث.',
    cancelled: 'أُلغيت المشاركة. حاول مجددًا.',
    denied: 'حُظرت المشاركة. انسخ التحديث يدويًا.',
    failed: 'تعذّرت المشاركة. انسخ التحديث يدويًا.',
    unsupported: 'النسخ غير متاح. حدّد التحديث أدناه.',
    invalid: 'تحديث العالم غير متاح.',
    manualLabel: 'نسخ يدوي',
    shareTitle: 'تحديث عالم Creatorverse',
    payloadTemplate: '{archetype} · {district}. المساهمات: {count} · الطاقة: {total}.',
    archetypes: Object.freeze({
      cosmic: 'عالم الحدادة النجمية',
      wild: 'العالم الأخضر',
      future: 'عالم الإشارة',
    }),
    districts: Object.freeze({ 'beacon-district': 'حيّ المنارة' }),
  }),
});

export function normalizeCreatorRealmUpdateLocale(locale) {
  return String(locale || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getCreatorRealmUpdateCopy(locale = 'en') {
  return COPY[normalizeCreatorRealmUpdateLocale(locale)];
}

function keyShape(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? keyShape(child, path) : [path];
  }).sort();
}

export function getCreatorRealmUpdateKeySets() {
  return Object.freeze({ en: keyShape(COPY.en), ar: keyShape(COPY.ar) });
}
