const copy = {
  en: {
    creator: { realm: 'Noura · Folded Horizon', live: 'Light relay' },
    world: {
      title: 'Carry the Light',
      goal: 'Reach the next lantern',
      progress: '{current} of 8 lanterns',
      action: 'Carry light',
      hint: 'Tap when the current aligns',
      language: 'Language',
      english: 'English',
      arabic: 'Arabic',
      soundOn: 'Sound on',
      soundOff: 'Sound off',
      soundUnavailable: 'Sound unavailable',
      loading: 'Preparing light',
    },
    active: {
      status: 'Tune now',
      tune: 'Tune',
      counter: '{current} of 3',
      started: 'Light current started',
      aligned: 'Current aligned {count} of 3',
      missed: 'Current faded {count} of 3',
    },
    result: {
      arrived: 'The light arrived',
      impact: 'One lantern joined the grove',
      share: 'Share light',
      complete: 'The grove is awake',
      completeImpact: 'All eight lanterns are lit',
      shareComplete: 'Share opening',
      failed: 'The current faded',
      retry: 'Retry',
      storage: 'Light could not be saved',
      stale: 'The grove has moved forward',
      openCurrent: 'Open current world',
      unavailable: 'This light path is unavailable',
      recovery: 'Open current world',
      changed: 'One lantern changed',
    },
    share: {
      preview: 'Share light',
      save: 'Save image',
      copy: 'Copy link',
      close: 'Close share preview',
      saved: 'Image saved',
      copied: 'Light link copied',
      shared: 'Light update ready',
      failed: 'Sharing failed. Try again.',
      cancelled: 'Not shared',
    },
    aria: {
      emblem: 'Folded Horizon realm emblem',
      utility: 'World controls',
      world: 'The completed Loombridge reaches Signal Grove with an unfinished path to the next dormant lantern.',
      progress: 'Signal lantern progress',
      contribution: 'Tune the current contribution',
      target: 'Next dormant signal lantern',
      unfinished: 'Unfinished structural light path',
      connected: 'Completed structural light path',
    },
    media: {
      world: 'Folded Horizon',
      title: 'Light the Far Shore',
      invitation: 'Carry the light onward',
      progress: '{current} of 8 lanterns',
      alternative: 'The completed Loombridge reaches Signal Grove with {current} active lanterns and one unfinished light path to the next dormant lantern.',
    },
  },
  ar: {
    creator: { realm: 'نورة · الأفق المطوي', live: 'مسار النور' },
    world: {
      title: 'احمل النور',
      goal: 'أوصل النور إلى المنارة',
      progress: '{current} من ٨ منارات',
      action: 'احمل النور',
      hint: 'المس عند تطابق التيار',
      language: 'اللغة',
      english: 'English',
      arabic: 'العربية',
      soundOn: 'الصوت مفعل',
      soundOff: 'الصوت مكتوم',
      soundUnavailable: 'الصوت غير مدعوم',
      loading: 'نهيئ النور',
    },
    active: {
      status: 'اضبط الآن',
      tune: 'اضبط',
      counter: '{current} من ٣',
      started: 'بدأ تيار النور',
      aligned: 'تطابق التيار {count} من ٣',
      missed: 'خفت التيار {count} من ٣',
    },
    result: {
      arrived: 'وصل النور',
      impact: 'انضمت منارة إلى الحقل',
      share: 'شارك النور',
      complete: 'استيقظ حقل المنارات',
      completeImpact: 'أُضيئت المنارات الثماني',
      shareComplete: 'شارك الفتح',
      failed: 'خفت التيار',
      retry: 'أعد المحاولة',
      storage: 'تعذّر حفظ النور',
      stale: 'تقدّم الحقل',
      openCurrent: 'افتح العالم الحالي',
      unavailable: 'مسار النور غير متاح',
      recovery: 'افتح العالم الحالي',
      changed: 'تغيرت منارة واحدة',
    },
    share: {
      preview: 'شارك النور',
      save: 'حفظ الصورة',
      copy: 'نسخ الرابط',
      close: 'إغلاق معاينة المشاركة',
      saved: 'تم حفظ الصورة',
      copied: 'تم نسخ رابط النور',
      shared: 'تحديث النور جاهز',
      failed: 'تعذرت المشاركة. حاول مجددًا.',
      cancelled: 'لم تتم المشاركة',
    },
    aria: {
      emblem: 'شعار عالم الأفق المطوي',
      utility: 'أدوات العالم',
      world: 'يمتد جسر النور المكتمل إلى حقل الإشارة مع مسار غير مكتمل نحو المنارة الخاملة التالية.',
      progress: 'تقدم منارات الإشارة',
      contribution: 'مساهمة ضبط التيار',
      target: 'المنارة الخاملة التالية',
      unfinished: 'مسار نور إنشائي غير مكتمل',
      connected: 'مسار نور إنشائي مكتمل',
    },
    media: {
      world: 'الأفق المطوي',
      title: 'أضيئوا الضفة البعيدة',
      invitation: 'احمل النور إلى المنارة',
      progress: '{current} من ٨ منارات',
      alternative: 'يمتد جسر النور المكتمل إلى حقل الإشارة مع {current} منارات مضيئة ومسار نور غير مكتمل نحو المنارة الخاملة التالية.',
    },
  },
};

export function getLivingWorldLightRelayCopy(locale = 'en') {
  return copy[locale === 'ar' ? 'ar' : 'en'];
}

export function formatLivingWorldLightRelayCopy(template, values = {}) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function livingWorldLightRelayKeyParity() {
  const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return entry && typeof entry === 'object' ? flatten(entry, path) : [path];
  });
  const en = flatten(copy.en).sort();
  const ar = flatten(copy.ar).sort();
  return { en, ar, equal: en.length === ar.length && en.every((key, index) => key === ar[index]) };
}
