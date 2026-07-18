const copy = Object.freeze({
  en: Object.freeze({
    receiptTitle: 'Your realm invite is ready',
    receiptSupport: 'Copy the link and open it in a fresh browser.',
    copyIdle: 'Copy invite',
    copyPending: 'Copying…',
    copySuccessLabel: 'Copied',
    copySuccess: 'Invite copied. Open it in a fresh browser.',
    copyManual: 'Copy is unavailable. Copy the selected link.',
    copyFailure: 'Couldn’t copy the invite. Try again.',
    retry: 'Try again',
    creatorLabel: 'Realm creator',
    entryPrefix: 'Welcome to ',
    featuredPromise: 'A community built around bold ideas.',
    invalidTitle: 'Invite could not open',
    invalidBody: 'Open the featured realm and continue safely.',
    invalidRecovery: 'Open featured realm',
    unsafeDraft: 'Use fictional realm details without links, contacts, handles, or real-world targeting.',
    themes: Object.freeze({ cosmic: 'Signal', wild: 'Canopy', future: 'Circuit' }),
  }),
  ar: Object.freeze({
    receiptTitle: 'دعوتك إلى العالم جاهزة',
    receiptSupport: 'انسخ الرابط وافتحه في نافذة خاصة جديدة.',
    copyIdle: 'نسخ الدعوة',
    copyPending: 'جارٍ النسخ…',
    copySuccessLabel: 'تم النسخ',
    copySuccess: 'تم نسخ الدعوة. افتحها في نافذة خاصة جديدة.',
    copyManual: 'النسخ غير متاح. انسخ الرابط المحدد.',
    copyFailure: 'تعذر نسخ الدعوة. حاول مجددًا.',
    retry: 'حاول مجددًا',
    creatorLabel: 'صانع العالم',
    entryPrefix: 'مرحبًا بك في ',
    featuredPromise: 'مجتمع مبني حول أفكار جريئة.',
    invalidTitle: 'تعذر فتح الدعوة',
    invalidBody: 'افتح العالم المميز وتابع بأمان.',
    invalidRecovery: 'فتح العالم المميز',
    unsafeDraft: 'استخدم تفاصيل خيالية بلا روابط أو جهات اتصال أو معرّفات أو استهداف واقعي.',
    themes: Object.freeze({ cosmic: 'إشارة', wild: 'غابة', future: 'دائرة' }),
  }),
});

export function getPrototypeInviteCopy(locale = 'en') {
  return String(locale).toLowerCase().startsWith('ar') ? copy.ar : copy.en;
}

export function getPrototypeInviteKeySets() {
  return {
    en: Object.keys(copy.en).sort(),
    ar: Object.keys(copy.ar).sort(),
  };
}
