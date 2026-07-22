const mediaCopy = {
  en: {
    action: 'Share update',
    generating: 'Preparing image',
    sharing: 'Sharing',
    shared: 'Shared',
    dialogTitle: 'Share world update',
    save: 'Save image',
    copy: 'Copy link',
    close: 'Close',
    saved: 'Image saved',
    copied: 'Link copied',
    manual: 'Select link to copy',
    shareUnavailable: 'Sharing unavailable. Save instead.',
    generationError: 'Couldn’t create image. Try again.',
    retry: 'Try again',
    worldIdentity: 'Folded Horizon',
    eventTitle: 'Open the Next Region',
    partialLine: '{current} of {target} spans lit',
    partialInvitation: 'Help open the far shore',
    completeLine: 'The far shore is open',
    completeInvitation: 'See the opened horizon',
    partialAlt: 'Folded Horizon. Loombridge is partly lit at {current} of {target}; the far shore remains closed.',
    completeAlt: 'Folded Horizon. Loombridge is fully lit and the far shore is open.',
    shareTitle: 'Folded Horizon update',
    partialShareText: 'Help open the far shore',
    completeShareText: 'See the opened horizon',
    previewReady: 'Image ready',
  },
  ar: {
    action: 'شارك التحديث',
    generating: 'جارٍ تجهيز الصورة',
    sharing: 'جارٍ فتح المشاركة',
    shared: 'تمت المشاركة',
    dialogTitle: 'شارك تحديث العالم',
    save: 'احفظ الصورة',
    copy: 'انسخ الرابط',
    close: 'إغلاق',
    saved: 'تم حفظ الصورة',
    copied: 'تم نسخ الرابط',
    manual: 'حدّد الرابط لنسخه',
    shareUnavailable: 'المشاركة غير متاحة. احفظ الصورة.',
    generationError: 'تعذر إنشاء الصورة. حاول مجددًا.',
    retry: 'حاول مجددًا',
    worldIdentity: 'الأفق المطوي',
    eventTitle: 'افتحوا المنطقة التالية',
    partialLine: 'أُضيء {current} من {target} جزءًا',
    partialInvitation: 'ساعد في فتح الضفة',
    completeLine: 'فُتحت الضفة البعيدة',
    completeInvitation: 'شاهد الأفق المفتوح',
    partialAlt: 'الأفق المطوي. أُضيء {current} من {target} من جسر النور، وما زالت الضفة البعيدة مغلقة.',
    completeAlt: 'الأفق المطوي. اكتمل جسر النور وفُتحت الضفة البعيدة.',
    shareTitle: 'تحديث الأفق المطوي',
    partialShareText: 'ساعد في فتح الضفة',
    completeShareText: 'شاهد الأفق المفتوح',
    previewReady: 'الصورة جاهزة',
  },
};

export function getLivingWorldMediaCopy(locale = 'en') {
  return mediaCopy[locale === 'ar' ? 'ar' : 'en'];
}

export function formatLivingWorldMediaCopy(template, values = {}) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function livingWorldMediaCopyKeys(locale = 'en') {
  return Object.keys(getLivingWorldMediaCopy(locale)).sort();
}
