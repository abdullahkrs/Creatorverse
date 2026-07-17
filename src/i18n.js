const STORAGE_KEY = 'creatorverse-locale';

const ar = {
  'Season 0 · Prototype': 'الموسم 0 · نسخة تجريبية',
  'A playable community for creators': 'مجتمع تفاعلي لصنّاع المحتوى',
  'Turn your audience into a living digital world.': 'حوّل جمهورك إلى عالم رقمي حي.',
  'Build a fictional realm with your followers, launch safe community missions, collaborate with other creators, and create moments worth sharing.': 'ابنِ عالمًا خياليًا مع متابعيك، وأطلق مهام مجتمعية آمنة، وتعاون مع صنّاع محتوى آخرين، واصنع لحظات تستحق المشاركة.',
  'Join this realm': 'انضم إلى هذا العالم',
  'Create a realm': 'أنشئ عالمًا',
  'Fictional universe only · No real-world politics · No off-platform conflict': 'عالم خيالي فقط · دون سياسة واقعية · دون صراع خارج المنصة',
  'Featured creator realm': 'عالم صانع محتوى مميز',
  'Live realm preview': 'معاينة مباشرة للعالم',
  members: 'عضو',
  districts: 'مناطق',
  Ready: 'جاهز',
  '6 days': '6 أيام',
  'to launch': 'للإطلاق',
  streak: 'سلسلة',
  'Creator setup': 'إعداد صانع المحتوى',
  'Create a realm your audience will recognize.': 'أنشئ عالمًا يتعرّف إليه جمهورك فورًا.',
  'Start with identity, visual direction, and one safe community promise. You can refine everything later.': 'ابدأ بالهوية والأسلوب البصري ووعد مجتمعي آمن واحد. يمكنك تحسين كل شيء لاحقًا.',
  'Realm name': 'اسم العالم',
  'Creator handle': 'معرّف صانع المحتوى',
  'Community promise': 'وعد المجتمع',
  Cosmic: 'كوني',
  Wild: 'طبيعي',
  Future: 'مستقبلي',
  'Signals, portals, and luminous districts.': 'إشارات وبوابات ومناطق مضيئة.',
  'Floating forests, ruins, and discovery routes.': 'غابات عائمة وآثار ومسارات استكشاف.',
  'Neon systems, labs, and creator-powered cities.': 'أنظمة نيون ومختبرات ومدن يقودها صانع المحتوى.',
  'First seven-day goal': 'هدف الأيام السبعة الأولى',
  'Members choose Builder, Explorer, or Guardian.': 'يختار الأعضاء دور البنّاء أو المستكشف أو الحارس.',
  'You launch one controlled mission template.': 'تطلق قالب مهمة واحدًا مضبوطًا وآمنًا.',
  'Every completed action visibly powers the realm.': 'كل مساهمة مكتملة تطوّر العالم بشكل مرئي.',
  'No real-world politics or off-platform conflict.': 'لا سياسة واقعية ولا صراع خارج المنصة.',
  'I understand that all competition must remain inside the fictional Creatorverse universe.': 'أفهم أن جميع المنافسات يجب أن تبقى داخل عالم Creatorverse الخيالي.',
  Back: 'رجوع',
  Continue: 'متابعة',
  'Launch preview': 'إطلاق المعاينة',
  'Creator content bridge': 'جسر محتوى صانع المحتوى',
  'Bring a public post into your realm.': 'أدخل منشورًا عامًا إلى عالمك.',
  'Paste a public YouTube, TikTok, or X link. Creatorverse fetches basic public metadata only—never passwords, private messages, or follower lists.': 'ألصق رابطًا عامًا من YouTube أو TikTok أو X. يجلب Creatorverse بيانات عامة أساسية فقط، ولا يطلب كلمات مرور أو رسائل خاصة أو قوائم متابعين.',
  'Instagram · planned': 'Instagram · قريبًا',
  'Public post URL': 'رابط المنشور العام',
  'Fetch post': 'جلب المنشور',
  'Fetching…': 'جارٍ الجلب…',
  'Only allowlisted HTTPS domains are requested by the server. Imported data is not saved in this prototype.': 'لا يتصل الخادم إلا بنطاقات HTTPS المسموح بها. لا تُحفظ البيانات المستوردة في هذه النسخة التجريبية.',
  'No public thumbnail': 'لا توجد صورة مصغرة عامة',
  'Public creator post': 'منشور عام لصانع محتوى',
  'Open original': 'فتح المنشور الأصلي',
  'Use as mission seed': 'استخدمه كأساس لمهمة',
  'Your imported post will appear here.': 'سيظهر المنشور المستورد هنا.',
  'Use it later as the source for a safe mission, event announcement, or creator result card.': 'استخدمه لاحقًا كأساس لمهمة آمنة أو إعلان حدث أو بطاقة نتيجة.',
  'The first playable loop': 'حلقة اللعب الأولى',
  'Choose your role. Help the realm grow.': 'اختر دورك وساعد العالم على النمو.',
  Builder: 'البنّاء',
  Explorer: 'المستكشف',
  Guardian: 'الحارس',
  'Turn community activity into structures and upgrades.': 'حوّل نشاط المجتمع إلى مبانٍ وتطويرات.',
  'Discover new districts, routes, and seasonal rewards.': 'اكتشف مناطق ومسارات ومكافآت موسمية جديدة.',
  'Protect streaks and represent the realm in events.': 'احمِ سلاسل الإنجاز ومثّل العالم في الأحداث.',
  'Creator mission · 35 seconds': 'مهمة صانع المحتوى · 35 ثانية',
  'Power the Signal Harbor': 'فعّل ميناء الإشارة',
  'Select a role to unlock today’s mission.': 'اختر دورًا لفتح مهمة اليوم.',
  'Sky route': 'المسار السماوي',
  'Ocean route': 'المسار البحري',
  'Mission complete.': 'اكتملت المهمة.',
  'Your action added 3 realm energy and will appear in the creator’s share card.': 'أضافت مساهمتك 3 نقاط طاقة وستظهر في بطاقة مشاركة صانع المحتوى.',
  'Creator-led': 'بقيادة صانع المحتوى',
  'Every realm reflects the creator’s content, voice, and community rituals.': 'يعكس كل عالم محتوى صاحبه وأسلوبه وعادات مجتمعه.',
  'Audience-powered': 'مدعوم بالجمهور',
  'Active participation matters more than the creator’s external follower count.': 'المشاركة الفعلية أهم من عدد المتابعين الخارجي.',
  'Safe by design': 'آمن منذ التصميم',
  'Competition remains inside a fictional world through controlled mission templates.': 'تبقى المنافسة داخل عالم خيالي من خلال قوالب مهام مضبوطة.',
  'Complete all three fields to continue.': 'أكمل الحقول الثلاثة للمتابعة.',
  'Use a public HTTPS link from YouTube, TikTok, or X.': 'استخدم رابط HTTPS عامًا من YouTube أو TikTok أو X.',
  'The platform did not provide public metadata for this post.': 'لم توفر المنصة بيانات عامة لهذا المنشور.',
  'The social platform took too long to respond. Try again.': 'استغرقت المنصة وقتًا طويلًا في الاستجابة. حاول مرة أخرى.',
  'Enter a valid public post URL.': 'أدخل رابط منشور عام صالحًا.',
};

const placeholders = {
  'Nova Guild': 'عالم نوفا',
  '@yourhandle': '@معرفك',
  'What should members feel here?': 'ما الشعور الذي تريد أن يعيشه أعضاء مجتمعك؟',
};

let currentLocale = localStorage.getItem(STORAGE_KEY) || (navigator.language?.startsWith('ar') ? 'ar' : 'en');

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = locale === 'ar' ? 'ar' : 'en';
  localStorage.setItem(STORAGE_KEY, currentLocale);
}

function translateDynamic(text) {
  const trimmed = text.trim();
  if (ar[trimmed]) return text.replace(trimmed, ar[trimmed]);
  if (/^Creator setup · Step (\d+) of 3$/.test(trimmed)) {
    const step = trimmed.match(/\d+/)?.[0] || '1';
    return `إعداد صانع المحتوى · الخطوة ${step} من 3`;
  }
  if (/^Unlock /.test(trimmed)) return text.replace(trimmed, `فتح ${trimmed.slice(7)}`);
  if (/^Invite 30 members and unlock /.test(trimmed)) return `ادعُ 30 عضوًا وافتح ${trimmed.replace(/^Invite 30 members and unlock /, '').replace(/\.$/, '')}.`;
  if (/^By /.test(trimmed)) return text.replace(trimmed, `بواسطة ${trimmed.slice(3)}`);
  if (/^As a /.test(trimmed)) return 'اختر مسار الطاقة التالي لمجتمعك بحسب دورك.';
  return text;
}

export function applyLocale(root = document) {
  const isArabic = currentLocale === 'ar';
  document.documentElement.lang = currentLocale;
  document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isArabic);

  if (!isArabic) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    if (node.parentElement?.closest('script, style')) return;
    node.nodeValue = translateDynamic(node.nodeValue || '');
  });

  root.querySelectorAll('[placeholder]').forEach(element => {
    const translated = placeholders[element.getAttribute('placeholder')];
    if (translated) element.setAttribute('placeholder', translated);
  });
  root.querySelectorAll('[aria-label]').forEach(element => {
    const label = element.getAttribute('aria-label');
    if (ar[label]) element.setAttribute('aria-label', ar[label]);
  });
}
