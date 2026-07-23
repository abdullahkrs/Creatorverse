import { formatLivingWorldChapterCopy, getLivingWorldChapterCopy } from './living-world-chapter-i18n.js';

export const LIVING_WORLD_CHAPTER_MEDIA_WIDTH = 1080;
export const LIVING_WORLD_CHAPTER_MEDIA_HEIGHT = 1920;
export const LIVING_WORLD_CHAPTER_MEDIA_TYPE = 'image/png';
export const LIVING_WORLD_CHAPTER_MEDIA_FILENAME = 'creatorverse-light-far-shore.png';
export const LIVING_WORLD_CHAPTER_MEDIA_SCENE_BOUNDS = Object.freeze({ x: 0, y: 220, width: 1080, height: 1485 });
export const LIVING_WORLD_CHAPTER_MEDIA_TEXT_BOUNDS = Object.freeze({ x: 84, y: 1540, width: 912, height: 235 });

const CHAPTER_KEYS = [
  'v', 'chapterId', 'predecessor', 'creatorName', 'motif', 'landmark', 'chapter',
  'duration', 'target', 'progress', 'expiresAt', 'predecessorEventId',
];
const CHAPTER_ID = /^chapter_[a-z0-9]{20,40}$/u;
const SAFE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,27}$/u;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function localizedNumber(value, locale) {
  const plain = String(value);
  if (locale !== 'ar') return plain;
  return plain.replace(/\d/gu, digit => ARABIC_DIGITS[Number(digit)]);
}

function validateChapter(chapter) {
  if (!exactKeys(chapter, CHAPTER_KEYS)) throw new Error('INVALID_CHAPTER_MEDIA');
  if (chapter.v !== 1 || !CHAPTER_ID.test(chapter.chapterId)) throw new Error('INVALID_CHAPTER_MEDIA');
  if (typeof chapter.predecessor !== 'string' || chapter.predecessor.length < 20 || chapter.predecessor.length > 1500) throw new Error('INVALID_CHAPTER_MEDIA');
  if (typeof chapter.creatorName !== 'string' || chapter.creatorName.length > 28 || UNSAFE_TEXT.test(chapter.creatorName) || !SAFE_NAME.test(chapter.creatorName)) {
    throw new Error('INVALID_CHAPTER_MEDIA');
  }
  if (chapter.motif !== 'folded-horizon' || chapter.landmark !== 'signal-grove' || chapter.chapter !== 'light-far-shore') {
    throw new Error('INVALID_CHAPTER_MEDIA');
  }
  if (!['6h', '24h'].includes(chapter.duration) || chapter.target !== 8) throw new Error('INVALID_CHAPTER_MEDIA');
  if (!Number.isSafeInteger(chapter.progress) || chapter.progress < 0 || chapter.progress > 8) throw new Error('INVALID_CHAPTER_MEDIA');
  if (!Number.isSafeInteger(chapter.expiresAt) || chapter.expiresAt < 1) throw new Error('INVALID_CHAPTER_MEDIA');
  return chapter;
}

export function createLivingWorldChapterMediaModel(chapter, progress, locale = 'en') {
  const validated = validateChapter(chapter);
  if (!Number.isSafeInteger(progress) || progress < validated.progress || progress > 8) throw new Error('INVALID_CHAPTER_MEDIA_PROGRESS');
  const language = locale === 'ar' ? 'ar' : 'en';
  const c = getLivingWorldChapterCopy(language).media;
  const current = progress;
  const complete = current === 8;
  const values = { current: localizedNumber(current, language) };
  return Object.freeze({
    width: LIVING_WORLD_CHAPTER_MEDIA_WIDTH,
    height: LIVING_WORLD_CHAPTER_MEDIA_HEIGHT,
    type: LIVING_WORLD_CHAPTER_MEDIA_TYPE,
    filename: LIVING_WORLD_CHAPTER_MEDIA_FILENAME,
    locale: language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    state: complete ? 'complete' : 'partial',
    current,
    target: 8,
    worldIdentity: c.world,
    eventTitle: c.title,
    outcome: complete ? c.complete : formatLivingWorldChapterCopy(c.partial, values),
    invitation: complete ? c.completeCall : c.partialCall,
    alternative: complete ? c.altComplete : formatLivingWorldChapterCopy(c.altPartial, values),
    signature: 'Creatorverse',
    sceneRatio: LIVING_WORLD_CHAPTER_MEDIA_SCENE_BOUNDS.height / LIVING_WORLD_CHAPTER_MEDIA_HEIGHT,
  });
}

export function createLivingWorldChapterSharePayload(model, url) {
  if (!model || model.filename !== LIVING_WORLD_CHAPTER_MEDIA_FILENAME || model.type !== LIVING_WORLD_CHAPTER_MEDIA_TYPE) {
    throw new Error('INVALID_CHAPTER_MEDIA_MODEL');
  }
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || !parsed.hash.startsWith('#world-chapter=')) {
    throw new Error('INVALID_CHAPTER_MEDIA_URL');
  }
  return Object.freeze({ title: model.eventTitle, text: model.invitation, url: parsed.toString() });
}

export function supportsLivingWorldChapterFileShare(navigatorLike, file) {
  if (typeof navigatorLike?.share !== 'function' || typeof navigatorLike?.canShare !== 'function') return false;
  try { return navigatorLike.canShare({ files: [file] }) === true; } catch { return false; }
}

function cssColor(documentLike, property, fallback) {
  try {
    return documentLike.defaultView?.getComputedStyle(documentLike.documentElement).getPropertyValue(property).trim() || fallback;
  } catch { return fallback; }
}

function palette(documentLike) {
  return {
    sky: cssColor(documentLike, '--cv-world-sky', '#111722'),
    skyRaised: cssColor(documentLike, '--cv-world-sky-raised', '#1b2330'),
    farStone: cssColor(documentLike, '--cv-world-far-stone', '#29313b'),
    nearStone: cssColor(documentLike, '--cv-world-near-stone', '#171d25'),
    mist: cssColor(documentLike, '--cv-world-mist', '#343f49'),
    shutter: cssColor(documentLike, '--cv-world-shutter', '#343a40'),
    tower: cssColor(documentLike, '--cv-world-tower', '#40464d'),
    towerCut: cssColor(documentLike, '--cv-world-tower-cut', '#20262d'),
    line: cssColor(documentLike, '--cv-world-stone-line', '#626970'),
    cord: cssColor(documentLike, '--cv-world-cord', '#6f7479'),
    slat: cssColor(documentLike, '--cv-world-thread', '#efcf72'),
    thread: cssColor(documentLike, '--cv-world-thread-bright', '#ffe69a'),
    deep: cssColor(documentLike, '--cv-world-thread-deep', '#5b4b24'),
    plant: cssColor(documentLike, '--cv-world-plant', '#7d9d78'),
    text: cssColor(documentLike, '--cv-color-text', '#f5f7fb'),
    muted: cssColor(documentLike, '--cv-color-text-muted', '#a8afbd'),
  };
}

function polygon(context, points, fill, stroke = null, width = 1) {
  context.beginPath();
  points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = width;
    context.stroke();
  }
}

function drawBridge(context, p) {
  context.strokeStyle = p.cord;
  context.lineWidth = 10;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(140, 1230);
  context.quadraticCurveTo(470, 1435, 790, 1030);
  context.stroke();
  context.beginPath();
  context.moveTo(155, 1310);
  context.quadraticCurveTo(475, 1490, 805, 1110);
  context.stroke();
  for (let index = 0; index < 12; index += 1) {
    const t = index / 11;
    const x = 205 + index * 48;
    const y = 1265 + Math.sin(t * Math.PI) * 104 - index * 18;
    polygon(context, [[x, y], [x + 42, y - 6], [x + 50, y + 29], [x + 8, y + 36]], p.slat, p.deep, 3);
  }
}

function drawLantern(context, index, active, complete, p) {
  const x = 365 + index * 76;
  const y = 780 - Math.sin((index / 7) * Math.PI) * 130 - index * 22;
  context.strokeStyle = active ? p.thread : p.line;
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(x, y + 145);
  context.lineTo(x + 18, y + 40);
  context.stroke();
  context.fillStyle = active ? p.thread : p.shutter;
  context.beginPath();
  context.arc(x + 18, y + 32, active ? 20 : 13, 0, Math.PI * 2);
  context.fill();
  polygon(context, [[x - 18, y + 30], [x + 8, y + 5], [x + 11, y + 65], [x - 12, y + 82]], active ? p.deep : p.shutter, p.line, 3);
  polygon(context, [[x + 28, y + 4], [x + 57, y + 30], [x + 44, y + 83], [x + 25, y + 64]], active ? p.deep : p.shutter, p.line, 3);
  if (active) {
    context.strokeStyle = p.thread;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(x + 18, y + 145);
    context.lineTo(x + 64, y + 156);
    context.stroke();
  }
  if (complete) {
    context.fillStyle = p.plant;
    context.fillRect(x - 8, y + 160, 54, 9);
  }
}

function drawWorld(context, model, p) {
  polygon(context, [[0, 0], [1080, 0], [1080, 620], [850, 555], [670, 625], [500, 500], [310, 605], [120, 540], [0, 610]], p.sky);
  polygon(context, [[0, 390], [200, 310], [390, 440], [570, 350], [770, 465], [930, 355], [1080, 450], [1080, 880], [0, 880]], p.skyRaised);
  polygon(context, [[230, 835], [420, 660], [650, 715], [820, 565], [1080, 690], [1080, 1210], [220, 1200]], p.farStone, p.line, 5);
  polygon(context, [[0, 1110], [220, 1010], [410, 1135], [600, 1040], [790, 1160], [930, 1060], [1080, 1130], [1080, 1920], [0, 1920]], p.nearStone, p.line, 5);
  drawBridge(context, p);
  const complete = model.state === 'complete';
  for (let index = 0; index < 8; index += 1) drawLantern(context, index, index < model.current, complete, p);
  context.strokeStyle = p.thread;
  context.lineWidth = 9;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(175, 1260);
  context.bezierCurveTo(360, 1210, 480, 920, 365 + Math.min(model.current, 7) * 76, 820 - Math.min(model.current, 7) * 22);
  context.stroke();
  if (complete) {
    context.fillStyle = p.towerCut;
    for (let index = 0; index < 5; index += 1) context.fillRect(650 + index * 62, 900 - index * 18, 38, 72);
    context.strokeStyle = p.plant;
    context.lineWidth = 11;
    context.beginPath();
    context.moveTo(570, 1090);
    context.quadraticCurveTo(690, 970, 820, 1085);
    context.quadraticCurveTo(905, 1000, 1000, 1080);
    context.stroke();
  }
}

function drawText(context, model, p) {
  const rtl = model.direction === 'rtl';
  const x = rtl ? 996 : 84;
  context.direction = rtl ? 'rtl' : 'ltr';
  context.textAlign = rtl ? 'right' : 'left';
  context.textBaseline = 'alphabetic';
  const write = (text, y, size, weight = 700, color = p.text, maxWidth = 912) => {
    context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.lineWidth = Math.max(3, size * 0.06);
    context.strokeStyle = p.nearStone;
    context.strokeText(text, x, y, maxWidth);
    context.fillStyle = color;
    context.fillText(text, x, y, maxWidth);
  };
  write(model.worldIdentity, 145, 38, 750, p.slat);
  write(model.eventTitle, 245, model.locale === 'ar' ? 64 : 68, 800);
  write(model.outcome, 1638, model.locale === 'ar' ? 49 : 51, 800);
  write(model.invitation, 1718, model.locale === 'ar' ? 37 : 39, 650, p.muted);
  write(model.signature, 1866, 30, 750, p.slat);
}

export async function renderLivingWorldChapterMedia(model, { documentLike = globalThis.document } = {}) {
  if (!documentLike?.createElement || model?.width !== 1080 || model?.height !== 1920) throw new Error('CHAPTER_MEDIA_RENDER_UNAVAILABLE');
  await documentLike.fonts?.ready;
  const canvas = documentLike.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('CHAPTER_MEDIA_RENDER_UNAVAILABLE');
  const p = palette(documentLike);
  context.fillStyle = p.sky;
  context.fillRect(0, 0, 1080, 1920);
  drawWorld(context, model, p);
  drawText(context, model, p);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value && value.type === 'image/png' && value.size > 1024
      ? resolve(value)
      : reject(new Error('CHAPTER_MEDIA_RENDER_FAILED')), 'image/png');
  });
  return Object.freeze({ blob, width: 1080, height: 1920 });
}
