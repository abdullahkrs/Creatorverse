const COPY = Object.freeze({
  en: Object.freeze({
    districtName: 'Beacon District',
    lockedValue: '0 / 3',
    unlockedValue: '3 / 3',
    lockedStatus: 'Locked · 0 / 3',
    unlockedStatus: 'Open · 3 / 3',
    unlockedTitle: 'District unlocked',
    unlockedSupport: 'Your +3 opened Beacon District.',
    announcement: 'District unlocked. Your +3 opened Beacon District.',
    progressLabel: 'Beacon District progress',
  }),
  ar: Object.freeze({
    districtName: 'حيّ المنارة',
    lockedValue: '٠ / ٣',
    unlockedValue: '٣ / ٣',
    lockedStatus: 'مغلق · ٠ / ٣',
    unlockedStatus: 'مفتوح · ٣ / ٣',
    unlockedTitle: 'تم فتح الحي',
    unlockedSupport: 'مساهمتك +٣ فتحت حيّ المنارة.',
    announcement: 'تم فتح الحي. مساهمتك +٣ فتحت حيّ المنارة.',
    progressLabel: 'تقدم حيّ المنارة',
  }),
});

export function normalizeDistrictLocale(locale) {
  return String(locale || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getDistrictProgressCopy(locale = 'en') {
  return COPY[normalizeDistrictLocale(locale)];
}

export const districtProgressLocaleKeys = Object.freeze({
  en: Object.freeze(Object.keys(COPY.en).sort()),
  ar: Object.freeze(Object.keys(COPY.ar).sort()),
});
