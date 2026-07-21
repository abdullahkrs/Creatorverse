const COPY = Object.freeze({
  en: Object.freeze({
    districtName: 'Beacon District',
    energy: 'Energy',
    thresholdTemplate: 'Next stage at {threshold} energy.',
    completed: 'All four district stages are active.',
    transitionTemplate: '{district} reached {stage} at {total} energy.',
    energyUpdateTemplate: '{district} now holds {total} energy.',
    stages: Object.freeze({
      locked: Object.freeze({
        title: 'Locked district',
        support: 'The gate is closed until the first valid contribution arrives.',
      }),
      outpost: Object.freeze({
        title: 'Signal outpost',
        support: 'A single signal point now marks the district.',
      }),
      connected: Object.freeze({
        title: 'Connected quarter',
        support: 'Routes now link the signal points into one quarter.',
      }),
      illuminated: Object.freeze({
        title: 'Illuminated district',
        support: 'The district is fully linked and lit.',
      }),
    }),
  }),
  ar: Object.freeze({
    districtName: 'حيّ المنارة',
    energy: 'الطاقة',
    thresholdTemplate: 'المرحلة التالية عند طاقة {threshold}.',
    completed: 'اكتملت مراحل الحيّ الأربع.',
    transitionTemplate: 'وصل {district} إلى {stage} بطاقة {total}.',
    energyUpdateTemplate: 'أصبحت طاقة {district} {total}.',
    stages: Object.freeze({
      locked: Object.freeze({
        title: 'الحيّ مقفل',
        support: 'تبقى البوابة مغلقة حتى وصول أول مساهمة صالحة.',
      }),
      outpost: Object.freeze({
        title: 'نقطة إشارة',
        support: 'ظهرت نقطة إشارة واحدة داخل الحيّ.',
      }),
      connected: Object.freeze({
        title: 'حيّ مترابط',
        support: 'ربطت المسارات نقاط الإشارة في حيّ واحد.',
      }),
      illuminated: Object.freeze({
        title: 'حيّ مضاء',
        support: 'اكتمل ترابط الحيّ وإضاءته.',
      }),
    }),
  }),
});

export function normalizeBeaconDistrictGrowthLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getBeaconDistrictGrowthCopy(locale = 'en') {
  return COPY[normalizeBeaconDistrictGrowthLocale(locale)];
}

function keyPaths(value, prefix = '') {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === 'object' && !Array.isArray(nested)
      ? keyPaths(nested, path)
      : [path];
  }).sort();
}

export function getBeaconDistrictGrowthKeySets() {
  return Object.freeze({
    en: Object.freeze(keyPaths(COPY.en)),
    ar: Object.freeze(keyPaths(COPY.ar)),
  });
}
