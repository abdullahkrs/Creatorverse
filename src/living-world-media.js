import { formatLivingWorldMediaCopy, getLivingWorldMediaCopy } from './living-world-media-i18n.js';

export const LIVING_WORLD_MEDIA_WIDTH = 1080;
export const LIVING_WORLD_MEDIA_HEIGHT = 1920;
export const LIVING_WORLD_MEDIA_TYPE = 'image/png';
export const LIVING_WORLD_MEDIA_FILENAME = 'creatorverse-folded-horizon.png';
export const LIVING_WORLD_MEDIA_SCENE_BOUNDS = Object.freeze({ x: 0, y: 250, width: 1080, height: 1440 });

const EVENT_KEYS = ['v', 'eventId', 'creatorName', 'motif', 'landmark', 'duration', 'target', 'progress', 'expiresAt'];
const EVENT_ID = /^event_[a-z0-9]{20,40}$/u;
const SAFE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,27}$/u;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const TARGETS = new Set([12, 24, 48]);
const DURATIONS = new Set(['6h', '24h']);
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function validateEvent(event) {
  if (!exactKeys(event, EVENT_KEYS)) throw new Error('INVALID_MEDIA_EVENT');
  if (event.v !== 1 || !EVENT_ID.test(event.eventId)) throw new Error('INVALID_MEDIA_EVENT');
  if (typeof event.creatorName !== 'string' || event.creatorName.length > 28 || UNSAFE_TEXT.test(event.creatorName) || !SAFE_NAME.test(event.creatorName)) {
    throw new Error('INVALID_MEDIA_EVENT');
  }
  if (event.motif !== 'folded-horizon' || event.landmark !== 'loombridge') throw new Error('INVALID_MEDIA_EVENT');
  if (!DURATIONS.has(event.duration) || !TARGETS.has(event.target)) throw new Error('INVALID_MEDIA_EVENT');
  safeInteger(event.progress, 0, event.target, 'INVALID_MEDIA_EVENT');
  safeInteger(event.expiresAt, 1, Number.MAX_SAFE_INTEGER, 'INVALID_MEDIA_EVENT');
  return event;
}

function localizedNumber(value, locale) {
  const plain = String(value);
  if (locale !== 'ar') return plain;
  return plain.replace(/\d/gu, digit => ARABIC_INDIC_DIGITS[Number(digit)]);
}

export function createLivingWorldMediaModel(event, progress, locale = 'en') {
  const validated = validateEvent(event);
  const language = locale === 'ar' ? 'ar' : 'en';
  const current = safeInteger(progress, validated.progress, validated.target, 'INVALID_MEDIA_PROGRESS');
  const complete = current >= validated.target;
  const copy = getLivingWorldMediaCopy(language);
  const values = {
    current: localizedNumber(current, language),
    target: localizedNumber(validated.target, language),
  };

  return Object.freeze({
    width: LIVING_WORLD_MEDIA_WIDTH,
    height: LIVING_WORLD_MEDIA_HEIGHT,
    type: LIVING_WORLD_MEDIA_TYPE,
    filename: LIVING_WORLD_MEDIA_FILENAME,
    locale: language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    state: complete ? 'complete' : 'partial',
    current,
    target: validated.target,
    activeSlats: complete ? 12 : Math.min(11, Math.floor((current / validated.target) * 12)),
    worldIdentity: copy.worldIdentity,
    eventTitle: copy.eventTitle,
    outcome: complete
      ? copy.completeLine
      : formatLivingWorldMediaCopy(copy.partialLine, values),
    invitation: complete ? copy.completeInvitation : copy.partialInvitation,
    alternative: complete
      ? copy.completeAlt
      : formatLivingWorldMediaCopy(copy.partialAlt, values),
    shareTitle: copy.shareTitle,
    shareText: complete ? copy.completeShareText : copy.partialShareText,
    signature: 'Creatorverse',
    sceneRatio: LIVING_WORLD_MEDIA_SCENE_BOUNDS.height / LIVING_WORLD_MEDIA_HEIGHT,
  });
}

export function createLivingWorldMediaSharePayload(model, url) {
  if (!model || model.type !== LIVING_WORLD_MEDIA_TYPE || model.filename !== LIVING_WORLD_MEDIA_FILENAME) {
    throw new Error('INVALID_MEDIA_MODEL');
  }
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || !parsed.hash.startsWith('#world-event=')) {
    throw new Error('INVALID_MEDIA_URL');
  }
  return Object.freeze({
    title: model.shareTitle,
    text: model.shareText,
    url: parsed.toString(),
  });
}

export function supportsLivingWorldFileShare(navigatorLike, file) {
  if (typeof navigatorLike?.share !== 'function' || typeof navigatorLike?.canShare !== 'function') return false;
  try {
    return navigatorLike.canShare({ files: [file] }) === true;
  } catch {
    return false;
  }
}

export function classifyLivingWorldShareFailure(error) {
  if (error?.name === 'AbortError') return 'cancelled';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'denied';
  return 'unavailable';
}

function cssColor(documentLike, property, fallback) {
  try {
    const value = documentLike.defaultView
      ?.getComputedStyle(documentLike.documentElement)
      .getPropertyValue(property)
      .trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

function mediaPalette(documentLike) {
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
    slatDark: cssColor(documentLike, '--cv-world-slat-dark', '#2c333a'),
    thread: cssColor(documentLike, '--cv-world-thread', '#efcf72'),
    threadBright: cssColor(documentLike, '--cv-world-thread-bright', '#ffe69a'),
    threadDeep: cssColor(documentLike, '--cv-world-thread-deep', '#5b4b24'),
    plant: cssColor(documentLike, '--cv-world-plant', '#7d9d78'),
    text: cssColor(documentLike, '--cv-color-text', '#f5f7fb'),
    muted: cssColor(documentLike, '--cv-color-text-muted', '#a8afbd'),
  };
}

function polygon(context, points, fill, stroke = null, width = 1) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = width;
    context.stroke();
  }
}

function drawTower(context, x, y, palette) {
  polygon(context, [[x, y + 330], [x + 24, y], [x + 112, y], [x + 136, y + 330]], palette.tower, palette.line, 5);
  context.fillStyle = palette.towerCut;
  context.fillRect(x + 42, y + 54, 54, 48);
  context.fillRect(x + 50, y + 148, 38, 124);
}

function drawWorld(context, model, palette) {
  polygon(context, [[0, 0], [1080, 0], [1080, 520], [880, 470], [710, 520], [535, 420], [350, 510], [170, 455], [0, 525]], palette.sky);
  polygon(context, [[0, 360], [190, 300], [365, 410], [540, 330], [735, 445], [900, 350], [1080, 430], [1080, 790], [0, 790]], palette.skyRaised);
  polygon(context, [[0, 735], [180, 655], [340, 750], [515, 625], [680, 730], [845, 640], [1080, 760], [1080, 1180], [0, 1180]], palette.farStone, palette.line, 4);

  if (model.state === 'complete') {
    polygon(context, [[680, 665], [794, 620], [756, 920], [620, 970]], palette.shutter, palette.line, 4);
    polygon(context, [[810, 620], [956, 675], [1080, 795], [1080, 970], [860, 920]], palette.shutter, palette.line, 4);
    context.fillStyle = palette.threadDeep;
    context.fillRect(762, 680, 42, 94);
    context.fillRect(828, 650, 36, 78);
    context.fillRect(892, 710, 46, 104);
    context.strokeStyle = palette.plant;
    context.lineWidth = 12;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(700, 1000);
    context.quadraticCurveTo(730, 900, 760, 1000);
    context.quadraticCurveTo(792, 875, 825, 1000);
    context.quadraticCurveTo(860, 910, 900, 1000);
    context.stroke();
  } else {
    polygon(context, [[670, 650], [860, 600], [930, 710], [858, 1040], [660, 1080]], palette.shutter, palette.line, 5);
    polygon(context, [[860, 600], [1080, 735], [1080, 1080], [858, 1040], [930, 710]], palette.shutter, palette.line, 5);
  }

  polygon(context, [[0, 1010], [175, 930], [355, 1020], [545, 950], [720, 1035], [900, 960], [1080, 1040], [1080, 1360], [0, 1360]], palette.mist);
  polygon(context, [[0, 1280], [220, 1175], [390, 1325], [560, 1220], [760, 1370], [920, 1260], [1080, 1340], [1080, 1920], [0, 1920]], palette.nearStone, palette.line, 5);

  drawTower(context, 150, 720, palette);
  drawTower(context, 760, 720, palette);

  context.strokeStyle = palette.cord;
  context.lineWidth = 10;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(255, 850);
  context.quadraticCurveTo(540, 1080, 825, 850);
  context.stroke();
  context.beginPath();
  context.moveTo(255, 940);
  context.quadraticCurveTo(540, 1130, 825, 940);
  context.stroke();

  for (let index = 0; index < 12; index += 1) {
    const t = index / 11;
    const x = 292 + index * 45;
    const y = 956 + Math.sin(t * Math.PI) * 78;
    const lit = index < model.activeSlats;
    polygon(
      context,
      [[x, y], [x + 39, y - 6], [x + 48, y + 28], [x + 8, y + 34]],
      lit ? palette.thread : palette.slatDark,
      lit ? palette.threadDeep : palette.line,
      3,
    );
  }

  const endIndex = model.state === 'complete' ? 11 : Math.max(0, model.activeSlats);
  const endX = 315 + endIndex * 45;
  const endY = 970 + Math.sin((endIndex / 11) * Math.PI) * 78;
  context.strokeStyle = palette.threadBright;
  context.lineWidth = 12;
  context.lineCap = 'round';
  context.setLineDash([30, 22]);
  context.beginPath();
  context.moveTo(540, 1740);
  context.bezierCurveTo(530, 1510, 430, 1390, 510, 1240);
  context.bezierCurveTo(550, 1160, endX - 50, endY + 100, endX, endY + 18);
  context.stroke();
  context.setLineDash([]);
}

function drawText(context, model, palette) {
  const rtl = model.direction === 'rtl';
  const x = rtl ? 996 : 84;
  context.direction = rtl ? 'rtl' : 'ltr';
  context.textAlign = rtl ? 'right' : 'left';
  context.textBaseline = 'alphabetic';

  const write = (text, y, size, weight = 700, color = palette.text, maxWidth = 912) => {
    context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.lineWidth = Math.max(3, size * 0.065);
    context.strokeStyle = palette.nearStone;
    context.strokeText(text, x, y, maxWidth);
    context.fillStyle = color;
    context.fillText(text, x, y, maxWidth);
  };

  write(model.worldIdentity, 142, 38, 750, palette.thread);
  write(model.eventTitle, 244, model.locale === 'ar' ? 66 : 70, 800);
  write(model.outcome, 1636, model.locale === 'ar' ? 50 : 52, 800);
  write(model.invitation, 1716, model.locale === 'ar' ? 38 : 40, 650, palette.muted);
  write(model.signature, 1866, 30, 750, palette.thread);
}

export async function renderLivingWorldMedia(model, { documentLike = globalThis.document } = {}) {
  if (!documentLike?.createElement || model?.width !== LIVING_WORLD_MEDIA_WIDTH || model?.height !== LIVING_WORLD_MEDIA_HEIGHT) {
    throw new Error('MEDIA_RENDER_UNAVAILABLE');
  }
  await documentLike.fonts?.ready;
  const canvas = documentLike.createElement('canvas');
  canvas.width = LIVING_WORLD_MEDIA_WIDTH;
  canvas.height = LIVING_WORLD_MEDIA_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('MEDIA_RENDER_UNAVAILABLE');
  const palette = mediaPalette(documentLike);
  context.fillStyle = palette.sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawWorld(context, model, palette);
  drawText(context, model, palette);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => {
      if (!value || value.type !== LIVING_WORLD_MEDIA_TYPE || value.size < 1024) reject(new Error('MEDIA_RENDER_FAILED'));
      else resolve(value);
    }, LIVING_WORLD_MEDIA_TYPE);
  });

  return Object.freeze({ blob, width: canvas.width, height: canvas.height });
}
