import { formatLivingWorldSkywellCopy, getLivingWorldSkywellCopy } from './living-world-skywell-i18n.js';

export const LIVING_WORLD_SKYWELL_MEDIA_WIDTH = 1080;
export const LIVING_WORLD_SKYWELL_MEDIA_HEIGHT = 1920;
export const LIVING_WORLD_SKYWELL_MEDIA_TYPE = 'image/png';
export const LIVING_WORLD_SKYWELL_MEDIA_FILENAME = 'creatorverse-skywell.png';
export const LIVING_WORLD_SKYWELL_MEDIA_SCENE_BOUNDS = Object.freeze({ x: 0, y: 300, width: 1080, height: 1280 });
export const LIVING_WORLD_SKYWELL_MEDIA_TEXT_BOUNDS = Object.freeze({ x: 84, y: 1580, width: 912, height: 196 });

const SKYWELL_KEYS = [
  'v', 'skywellId', 'predecessor', 'creatorName', 'motif', 'landmark', 'event',
  'duration', 'target', 'progress', 'expiresAt',
];
const SKYWELL_ID = /^skywell_[a-z0-9]{20,40}$/u;
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

function validateSkywell(skywell) {
  if (!exactKeys(skywell, SKYWELL_KEYS)) throw new Error('INVALID_SKYWELL_MEDIA');
  if (skywell.v !== 1 || !SKYWELL_ID.test(skywell.skywellId)) throw new Error('INVALID_SKYWELL_MEDIA');
  if (typeof skywell.predecessor !== 'string' || skywell.predecessor.length < 20 || skywell.predecessor.length > 1800) {
    throw new Error('INVALID_SKYWELL_MEDIA');
  }
  if (
    typeof skywell.creatorName !== 'string'
    || skywell.creatorName.length > 28
    || UNSAFE_TEXT.test(skywell.creatorName)
    || !SAFE_NAME.test(skywell.creatorName)
  ) {
    throw new Error('INVALID_SKYWELL_MEDIA');
  }
  if (
    skywell.motif !== 'folded-horizon'
    || skywell.landmark !== 'skywell'
    || skywell.event !== 'open-skywell'
    || skywell.duration !== '6h'
    || skywell.target !== 6
  ) {
    throw new Error('INVALID_SKYWELL_MEDIA');
  }
  if (!Number.isSafeInteger(skywell.progress) || skywell.progress < 0 || skywell.progress > 6) {
    throw new Error('INVALID_SKYWELL_MEDIA');
  }
  if (!Number.isSafeInteger(skywell.expiresAt) || skywell.expiresAt < 1) throw new Error('INVALID_SKYWELL_MEDIA');
  return skywell;
}

export function createLivingWorldSkywellMediaModel(skywell, progress, locale = 'en') {
  const validated = validateSkywell(skywell);
  if (!Number.isSafeInteger(progress) || progress < validated.progress || progress > 6) {
    throw new Error('INVALID_SKYWELL_MEDIA_PROGRESS');
  }
  const language = locale === 'ar' ? 'ar' : 'en';
  const c = getLivingWorldSkywellCopy(language).media;
  const current = progress;
  const complete = current === 6;
  const values = { current: localizedNumber(current, language) };
  return Object.freeze({
    width: LIVING_WORLD_SKYWELL_MEDIA_WIDTH,
    height: LIVING_WORLD_SKYWELL_MEDIA_HEIGHT,
    type: LIVING_WORLD_SKYWELL_MEDIA_TYPE,
    filename: LIVING_WORLD_SKYWELL_MEDIA_FILENAME,
    locale: language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    state: complete ? 'complete' : 'partial',
    current,
    target: 6,
    worldIdentity: c.world,
    eventTitle: c.title,
    outcome: complete ? c.complete : formatLivingWorldSkywellCopy(c.partial, values),
    invitation: complete ? c.completeCall : c.partialCall,
    alternative: complete ? c.altComplete : formatLivingWorldSkywellCopy(c.altPartial, values),
    signature: 'Creatorverse',
  });
}

export function createLivingWorldSkywellSharePayload(model, url) {
  if (!model || model.filename !== LIVING_WORLD_SKYWELL_MEDIA_FILENAME || model.type !== LIVING_WORLD_SKYWELL_MEDIA_TYPE) {
    throw new Error('INVALID_SKYWELL_MEDIA_MODEL');
  }
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || !parsed.hash.startsWith('#world-skywell=')) {
    throw new Error('INVALID_SKYWELL_MEDIA_URL');
  }
  return Object.freeze({ title: model.eventTitle, text: model.invitation, url: parsed.toString() });
}

export function supportsLivingWorldSkywellFileShare(navigatorLike, file) {
  if (typeof navigatorLike?.share !== 'function' || typeof navigatorLike?.canShare !== 'function') return false;
  try { return navigatorLike.canShare({ files: [file] }) === true; } catch { return false; }
}

function cssColor(documentLike, property, fallback) {
  try {
    return documentLike.defaultView?.getComputedStyle(documentLike.documentElement).getPropertyValue(property).trim() || fallback;
  } catch {
    return fallback;
  }
}

function palette(documentLike) {
  return {
    sky: cssColor(documentLike, '--cv-world-sky', '#111722'),
    skyRaised: cssColor(documentLike, '--cv-world-sky-raised', '#1b2330'),
    farStone: cssColor(documentLike, '--cv-world-far-stone', '#29313b'),
    nearStone: cssColor(documentLike, '--cv-world-near-stone', '#171d25'),
    line: cssColor(documentLike, '--cv-world-stone-line', '#626970'),
    cord: cssColor(documentLike, '--cv-world-cord', '#6f7479'),
    thread: cssColor(documentLike, '--cv-world-thread', '#efcf72'),
    threadBright: cssColor(documentLike, '--cv-world-thread-bright', '#ffe69a'),
    threadDeep: cssColor(documentLike, '--cv-world-thread-deep', '#5b4b24'),
    shutter: cssColor(documentLike, '--cv-world-shutter', '#343a40'),
    plant: cssColor(documentLike, '--cv-world-plant', '#7d9d78'),
    text: cssColor(documentLike, '--cv-color-text', '#f5f7fb'),
    muted: cssColor(documentLike, '--cv-color-text-muted', '#a8afbd'),
    openedSky: '#59708a',
    openedSkyBright: '#9fc4df',
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
  context.lineWidth = 9;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(120, 1395);
  context.quadraticCurveTo(390, 1510, 665, 1260);
  context.stroke();
  context.beginPath();
  context.moveTo(132, 1465);
  context.quadraticCurveTo(405, 1570, 682, 1330);
  context.stroke();
  for (let index = 0; index < 12; index += 1) {
    const x = 180 + index * 43;
    const y = 1420 + Math.sin((index / 11) * Math.PI) * 82 - index * 12;
    polygon(context, [[x, y], [x + 38, y - 5], [x + 45, y + 24], [x + 7, y + 30]], p.thread, p.threadDeep, 3);
  }
}

function drawGrove(context, p) {
  for (let index = 0; index < 8; index += 1) {
    const x = 395 + index * 65;
    const y = 1125 - Math.sin((index / 7) * Math.PI) * 112 - index * 14;
    context.strokeStyle = p.thread;
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(x, y + 115);
    context.lineTo(x + 14, y + 35);
    context.stroke();
    context.fillStyle = p.threadBright;
    context.beginPath();
    context.arc(x + 14, y + 28, 15, 0, Math.PI * 2);
    context.fill();
    polygon(context, [[x - 14, y + 28], [x + 6, y + 5], [x + 8, y + 58], [x - 10, y + 70]], p.threadDeep, p.line, 3);
    polygon(context, [[x + 23, y + 4], [x + 48, y + 28], [x + 38, y + 72], [x + 21, y + 57]], p.threadDeep, p.line, 3);
  }
}

function skywellPoint(angle, radius) {
  const radians = angle * Math.PI / 180;
  return [540 + Math.cos(radians) * radius, 555 + Math.sin(radians) * radius];
}

function drawSkyWedge(context, index, p) {
  const angles = [-150, -90, -30, 30, 90, 150];
  const angle = angles[index];
  const start = (angle - 24) * Math.PI / 180;
  const end = (angle + 24) * Math.PI / 180;
  context.beginPath();
  context.moveTo(540, 555);
  context.arc(540, 555, 226, start, end);
  context.closePath();
  context.fillStyle = index % 2 ? p.openedSkyBright : p.openedSky;
  context.globalAlpha = 0.76;
  context.fill();
  context.globalAlpha = 1;
}

function drawSkywell(context, model, p) {
  const complete = model.state === 'complete';
  context.fillStyle = p.skyRaised;
  context.beginPath();
  context.arc(540, 555, 246, 0, Math.PI * 2);
  context.fill();
  for (let index = 0; index < model.current; index += 1) drawSkyWedge(context, index, p);

  context.strokeStyle = p.line;
  context.lineWidth = 18;
  context.beginPath();
  context.arc(540, 555, 252, 0, Math.PI * 2);
  context.stroke();

  const angles = [-150, -90, -30, 30, 90, 150];
  angles.forEach((angle, index) => {
    const open = index < model.current;
    const [startX, startY] = skywellPoint(angle, 42);
    const [endX, endY] = skywellPoint(angle, open ? 244 : 108);
    context.strokeStyle = open ? p.threadBright : p.shutter;
    context.lineWidth = open ? 18 : 22;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    context.fillStyle = open ? p.thread : p.nearStone;
    context.strokeStyle = open ? p.threadBright : p.line;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(startX, startY, open ? 16 : 13, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (!open) {
      context.setLineDash([10, 9]);
      context.strokeStyle = p.line;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(endX, endY);
      const [outerX, outerY] = skywellPoint(angle, 226);
      context.lineTo(outerX, outerY);
      context.stroke();
      context.setLineDash([]);
    }
  });

  context.strokeStyle = p.thread;
  context.lineWidth = 13;
  context.beginPath();
  context.moveTo(540, 1180);
  context.bezierCurveTo(518, 1010, 560, 805, 540, 610);
  context.stroke();

  if (complete) {
    context.fillStyle = p.openedSkyBright;
    context.globalAlpha = 0.25;
    context.beginPath();
    context.arc(540, 555, 205, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    const gradient = context.createLinearGradient(540, 650, 540, 1180);
    gradient.addColorStop(0, p.threadBright);
    gradient.addColorStop(1, 'rgba(255,230,154,0)');
    context.fillStyle = gradient;
    context.fillRect(518, 640, 44, 545);
  }
}

function drawWorld(context, model, p) {
  polygon(context, [[0, 260], [1080, 260], [1080, 870], [870, 805], [690, 875], [500, 760], [300, 860], [110, 795], [0, 850]], p.sky);
  polygon(context, [[0, 830], [210, 700], [390, 830], [600, 720], [780, 860], [960, 720], [1080, 800], [1080, 1250], [0, 1250]], p.skyRaised);
  polygon(context, [[0, 1260], [230, 1160], [420, 1280], [610, 1180], [800, 1300], [960, 1190], [1080, 1260], [1080, 1580], [0, 1580]], p.nearStone, p.line, 5);
  drawSkywell(context, model, p);
  drawGrove(context, p);
  drawBridge(context, p);
  context.strokeStyle = p.plant;
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(620, 1310);
  context.quadraticCurveTo(760, 1210, 920, 1320);
  context.stroke();
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
  write(model.worldIdentity, 145, 38, 750, p.thread);
  write(model.eventTitle, 245, model.locale === 'ar' ? 62 : 66, 800);
  write(model.outcome, 1650, model.locale === 'ar' ? 48 : 50, 800);
  write(model.invitation, 1730, model.locale === 'ar' ? 36 : 38, 650, p.muted);
  write(model.signature, 1866, 30, 750, p.thread);
}

export async function renderLivingWorldSkywellMedia(model, { documentLike = globalThis.document } = {}) {
  if (!documentLike?.createElement || model?.width !== 1080 || model?.height !== 1920) {
    throw new Error('SKYWELL_MEDIA_RENDER_UNAVAILABLE');
  }
  await documentLike.fonts?.ready;
  const canvas = documentLike.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('SKYWELL_MEDIA_RENDER_UNAVAILABLE');
  const p = palette(documentLike);
  context.fillStyle = p.sky;
  context.fillRect(0, 0, 1080, 1920);
  drawWorld(context, model, p);
  drawText(context, model, p);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value && value.type === 'image/png' && value.size > 1024
      ? resolve(value)
      : reject(new Error('SKYWELL_MEDIA_RENDER_FAILED')), 'image/png');
  });
  return Object.freeze({ blob, width: 1080, height: 1920 });
}
