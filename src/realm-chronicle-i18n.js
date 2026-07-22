const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Realm chronicle',
    summaryTemplate: '{count} contributions · {total} energy · {stage}',
    empty: 'No accepted contributions yet.',
    showAll: 'Show all',
    showRecent: 'Show recent',
    showingAllTemplate: 'Showing all {count} contributions.',
    showingRecentTemplate: 'Showing recent {count} contributions.',
    contributionLabel: 'Contribution',
    totalLabel: 'Realm total',
    sharedMission: 'Shared mission',
    missions: Object.freeze({
      'route-choice': 'Choose a Route',
      'relay-sequence': 'Link the Relays',
      'signal-match': 'Match the Signal',
    }),
    roles: Object.freeze({
      builder: 'Builder',
      explorer: 'Explorer',
      guardian: 'Guardian',
    }),
    routes: Object.freeze({
      sky: 'Sky route',
      ocean: 'Ocean route',
    }),
    stages: Object.freeze({
      locked: 'Locked district',
      outpost: 'Signal outpost',
      connected: 'Connected quarter',
      illuminated: 'Illuminated district',
    }),
  }),
  ar: Object.freeze({
    title: 'سجل العالم',
    summaryTemplate: '{count} مساهمات · {total} طاقة · {stage}',
    empty: 'لا توجد مساهمات مقبولة بعد.',
    showAll: 'عرض الكل',
    showRecent: 'عرض الأحدث',
    showingAllTemplate: 'يتم عرض جميع المساهمات وعددها {count}.',
    showingRecentTemplate: 'يتم عرض أحدث المساهمات وعددها {count}.',
    contributionLabel: 'المساهمة',
    totalLabel: 'إجمالي العالم',
    sharedMission: 'مهمة مشتركة',
    missions: Object.freeze({
      'route-choice': 'اختر مسارًا',
      'relay-sequence': 'اربط المرحّلات',
      'signal-match': 'طابق الإشارة',
    }),
    roles: Object.freeze({
      builder: 'البنّاء',
      explorer: 'المستكشف',
      guardian: 'الحارس',
    }),
    routes: Object.freeze({
      sky: 'المسار السماوي',
      ocean: 'المسار البحري',
    }),
    stages: Object.freeze({
      locked: 'الحيّ مقفل',
      outpost: 'نقطة إشارة',
      connected: 'حيّ مترابط',
      illuminated: 'حيّ مضاء',
    }),
  }),
});

export function normalizeRealmChronicleLocale(locale = 'en') {
  return String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getRealmChronicleCopy(locale = 'en') {
  return COPY[normalizeRealmChronicleLocale(locale)];
}

function keyShape(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? keyShape(child, path) : [path];
  }).sort();
}

export function getRealmChronicleKeySets() {
  return Object.freeze({ en: keyShape(COPY.en), ar: keyShape(COPY.ar) });
}
