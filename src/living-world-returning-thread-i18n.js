const copy = {
  en: {
    label: 'Your thread',
    woven: 'Woven into the bridge',
    extended: 'Your thread reached the lantern',
    worldSavedUnavailable: 'World saved; thread unavailable',
    deviceUnavailable: 'Thread unavailable on this device',
    continue: 'Continue',
    dismiss: 'Dismiss',
    restoredAlternative: 'Your earlier local thread continues across the bridge.',
    extendedAlternative: 'Your local thread now reaches the newly lit lantern.',
    restoredAnnouncement: 'Your earlier local thread continues across the bridge.',
    extendedAnnouncement: 'One lantern changed; your local thread reached it.',
  },
  ar: {
    label: 'خيطك',
    woven: 'نُسج داخل الجسر',
    extended: 'وصل خيطك إلى المنارة',
    worldSavedUnavailable: 'حُفظ العالم؛ الخيط غير متاح',
    deviceUnavailable: 'الخيط غير متاح على هذا الجهاز',
    continue: 'متابعة',
    dismiss: 'إغلاق',
    restoredAlternative: 'يمتد خيط مساهمتك المحلية السابقة عبر الجسر.',
    extendedAlternative: 'يمتد خيطك المحلي الآن إلى المنارة المضيئة حديثًا.',
    restoredAnnouncement: 'يمتد خيط مساهمتك المحلية السابقة عبر الجسر.',
    extendedAnnouncement: 'تغيرت منارة واحدة ووصل إليها خيطك المحلي.',
  },
};

export function getReturningThreadCopy(locale = 'en') {
  return copy[locale === 'ar' ? 'ar' : 'en'];
}

export function returningThreadKeyParity() {
  const en = Object.keys(copy.en).sort();
  const ar = Object.keys(copy.ar).sort();
  return Object.freeze({ en, ar, equal: en.length === ar.length && en.every((key, index) => key === ar[index]) });
}
