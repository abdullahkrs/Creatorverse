export const DEFAULT_MISSION_TEMPLATE_ID = 'route-choice';
export const MISSION_TEMPLATE_IDS = Object.freeze([
  DEFAULT_MISSION_TEMPLATE_ID,
  'relay-sequence',
  'signal-match',
]);

const TEMPLATE_IDS = new Set(MISSION_TEMPLATE_IDS);

const COPY = Object.freeze({
  en: Object.freeze({
    selectorLegend: 'Choose a mission',
    selectorHelp: 'Followers complete it after choosing a role.',
    validation: 'Choose a mission to continue.',
    repaired: 'Invite repaired. Default mission loaded.',
    safety: 'I understand that all competition must remain inside the fictional Creatorverse universe.',
    kicker: 'Mission · +3 energy',
    chooseRole: 'Choose a role',
    ready: 'Ready',
    active: 'In progress',
    complete: 'Mission complete',
    tryAgain: 'Try again',
    missionLabel: 'Mission',
    templates: Object.freeze({
      'route-choice': Object.freeze({
        name: 'Choose a Route',
        description: 'Pick one route.',
        prompt: 'Choose one energy route.',
        actions: Object.freeze({ sky: 'Sky route', ocean: 'Ocean route' }),
      }),
      'relay-sequence': Object.freeze({
        name: 'Link the Relays',
        description: 'Link three relays.',
        prompt: 'Activate each relay in order.',
        step: value => `Step ${value} of 3`,
        actions: Object.freeze({ 1: 'Relay 1', 2: 'Relay 2', 3: 'Relay 3' }),
      }),
      'signal-match': Object.freeze({
        name: 'Match the Signal',
        description: 'Match one signal.',
        prompt: 'Match the visible wave signal.',
        target: 'Target: Wave',
        incorrect: 'Signal mismatch. Try again.',
        actions: Object.freeze({ pulse: 'Pulse', beam: 'Beam', wave: 'Wave' }),
      }),
    }),
  }),
  ar: Object.freeze({
    selectorLegend: 'اختر مهمة',
    selectorHelp: 'يكملها المتابع بعد اختيار دوره.',
    validation: 'اختر مهمة للمتابعة.',
    repaired: 'تم إصلاح الدعوة وتحميل المهمة الافتراضية.',
    safety: 'أفهم أن جميع المنافسات يجب أن تبقى داخل عالم Creatorverse الخيالي.',
    kicker: 'مهمة · +٣ طاقة',
    chooseRole: 'اختر دورًا',
    ready: 'جاهزة',
    active: 'قيد التنفيذ',
    complete: 'اكتملت المهمة',
    tryAgain: 'حاول مجددًا',
    missionLabel: 'المهمة',
    templates: Object.freeze({
      'route-choice': Object.freeze({
        name: 'اختر مسارًا',
        description: 'اختر مسارًا واحدًا.',
        prompt: 'اختر مسار طاقة واحدًا.',
        actions: Object.freeze({ sky: 'المسار السماوي', ocean: 'المسار البحري' }),
      }),
      'relay-sequence': Object.freeze({
        name: 'اربط المرحّلات',
        description: 'اربط ثلاثة مرحّلات.',
        prompt: 'فعّل المرحّلات بالترتيب.',
        step: value => `الخطوة ${value} من ٣`,
        actions: Object.freeze({ 1: 'المرحّل ١', 2: 'المرحّل ٢', 3: 'المرحّل ٣' }),
      }),
      'signal-match': Object.freeze({
        name: 'طابق الإشارة',
        description: 'طابق إشارة واحدة.',
        prompt: 'طابق إشارة الموجة الظاهرة.',
        target: 'الهدف: موجة',
        incorrect: 'الإشارة غير مطابقة. حاول مجددًا.',
        actions: Object.freeze({ pulse: 'نبضة', beam: 'شعاع', wave: 'موجة' }),
      }),
    }),
  }),
});

export function normalizeMissionLocale(locale = 'en') {
  return String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function isMissionTemplateId(value) {
  return typeof value === 'string' && TEMPLATE_IDS.has(value);
}

export function normalizeMissionTemplateId(value, { fallback = true } = {}) {
  if (isMissionTemplateId(value)) return value;
  if (fallback) return DEFAULT_MISSION_TEMPLATE_ID;
  throw new TypeError('INVALID_MISSION_TEMPLATE');
}

export function getMissionTemplateCopy(locale = 'en') {
  return COPY[normalizeMissionLocale(locale)];
}

export function getMissionTemplateKeySets() {
  const keys = locale => Object.keys(COPY[locale].templates).sort();
  return Object.freeze({ en: keys('en'), ar: keys('ar') });
}

export function createMissionProgress(templateId) {
  return Object.freeze({
    templateId: normalizeMissionTemplateId(templateId, { fallback: false }),
    step: 0,
    completed: false,
    contribution: 0,
  });
}

export function applyMissionActivation(progress, activation) {
  if (!progress || progress.completed) return progress;
  const templateId = normalizeMissionTemplateId(progress.templateId, { fallback: false });

  if (templateId === 'route-choice') {
    if (!['sky', 'ocean'].includes(activation)) return progress;
    return Object.freeze({ ...progress, completed: true, contribution: 3 });
  }

  if (templateId === 'relay-sequence') {
    const expected = progress.step + 1;
    if (Number(activation) !== expected || expected > 3) return progress;
    return Object.freeze({
      ...progress,
      step: expected,
      completed: expected === 3,
      contribution: expected === 3 ? 3 : 0,
    });
  }

  if (activation !== 'wave') return progress;
  return Object.freeze({ ...progress, completed: true, contribution: 3 });
}
