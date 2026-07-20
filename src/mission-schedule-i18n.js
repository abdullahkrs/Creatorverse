const copy = Object.freeze({
  en: Object.freeze({
    selectorLegend: 'Signal window',
    selectorHelp: 'Choose when this mission can be played.',
    selectorValidation: 'Choose one signal window.',
    options: Object.freeze({
      'now-30m': 'Now · 30 min',
      'in-1h-30m': 'In 1 h · 30 min',
      'in-24h-24h': 'In 24 h · 24 h',
    }),
    kicker: 'Signal window',
    states: Object.freeze({
      upcoming: Object.freeze({
        title: 'Mission opens later',
        support: 'Return when this signal window opens.',
        control: 'Not open yet',
      }),
      active: Object.freeze({
        title: 'Mission signal open',
        support: 'Choose a role and complete the mission.',
        control: 'Play mission',
      }),
      ended: Object.freeze({
        title: 'Mission window ended',
        support: 'This signal window is closed.',
        control: 'Mission ended',
      }),
    }),
    back: 'Back to realm',
    transitionActive: 'Mission signal is now open.',
    transitionEnded: 'Mission window has ended.',
  }),
  ar: Object.freeze({
    selectorLegend: 'نافذة الإشارة',
    selectorHelp: 'اختر متى يمكن لعب هذه المهمة.',
    selectorValidation: 'اختر نافذة إشارة واحدة.',
    options: Object.freeze({
      'now-30m': 'الآن · 30 دقيقة',
      'in-1h-30m': 'بعد ساعة · 30 دقيقة',
      'in-24h-24h': 'بعد 24 ساعة · 24 ساعة',
    }),
    kicker: 'نافذة الإشارة',
    states: Object.freeze({
      upcoming: Object.freeze({
        title: 'المهمة تفتح لاحقًا',
        support: 'عُد عندما تفتح نافذة الإشارة.',
        control: 'لم تفتح بعد',
      }),
      active: Object.freeze({
        title: 'إشارة المهمة مفتوحة',
        support: 'اختر دورًا وأكمل المهمة.',
        control: 'العب المهمة',
      }),
      ended: Object.freeze({
        title: 'انتهت نافذة المهمة',
        support: 'أُغلقت نافذة الإشارة هذه.',
        control: 'انتهت المهمة',
      }),
    }),
    back: 'العودة إلى العالم',
    transitionActive: 'أصبحت إشارة المهمة مفتوحة الآن.',
    transitionEnded: 'انتهت نافذة المهمة.',
  }),
});

export function normalizeMissionScheduleLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function getMissionScheduleCopy(locale) {
  return copy[normalizeMissionScheduleLocale(locale)];
}

export function getMissionScheduleKeySets() {
  return Object.freeze({
    en: Object.freeze(Object.keys(copy.en).sort()),
    ar: Object.freeze(Object.keys(copy.ar).sort()),
  });
}
