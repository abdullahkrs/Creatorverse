import { createLivingWorldChapterMediaModel } from './living-world-chapter-media.js';
import {
  decodeLivingWorldSkywell,
  decodeSkywellPredecessor,
  encodeLivingWorldSkywell,
  LIVING_WORLD_SKYWELL_TARGET,
} from './living-world-skywell.js';
import {
  formatLivingWorldSkywellCopy,
  getLivingWorldSkywellCopy,
} from './living-world-skywell-i18n.js';

export const LIVING_WORLD_SKYWELL_MEDIA_WIDTH = 1080;
export const LIVING_WORLD_SKYWELL_MEDIA_HEIGHT = 1920;
export const LIVING_WORLD_SKYWELL_MEDIA_TYPE = 'image/png';
export const LIVING_WORLD_SKYWELL_MEDIA_FILENAME = 'creatorverse-open-skywell.png';
export const LIVING_WORLD_SKYWELL_MEDIA_TEXT_BOUNDS = Object.freeze({ x: 84, y: 96, width: 912, height: 204 });
export const LIVING_WORLD_SKYWELL_MEDIA_SCENE_BOUNDS = Object.freeze({ x: 0, y: 300, width: 1080, height: 1280 });
export const LIVING_WORLD_SKYWELL_MEDIA_INVITATION_BOUNDS = Object.freeze({ x: 84, y: 1580, width: 912, height: 196 });

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const RIB_ANGLES = Object.freeze([145, 180, 215, 325, 0, 35]);

function localizedNumber(value, locale) {
  const plain = String(value);
  if (locale !== 'ar') return plain;
  return plain.replace(/\d/gu, digit => ARABIC_DIGITS[Number(digit)]);
}

function canonicalEvent(event, options = {}) {
  const token = typeof event === 'string' ? event : encodeLivingWorldSkywell(event, options);
  return decodeLivingWorldSkywell(token, options);
}

export function createLivingWorldSkywellMediaModel(event, progress = event?.progress, locale = 'en', options = {}) {
  const validated = canonicalEvent(event, options);
  const current = Number(progress);
  if (!Number.isSafeInteger(current) || current < validated.progress || current > LIVING_WORLD_SKYWELL_TARGET) {
    throw new Error('INVALID_SKYWELL_MEDIA_PROGRESS');
  }
  const predecessor = decodeSkywellPredecessor(validated, { ...options, allowExpired: true });
  const language = locale === 'ar' ? 'ar' : 'en';
  const c = getLivingWorldSkywellCopy(language).media;
  const values = { current: localizedNumber(current, language) };
  const complete = current === LIVING_WORLD_SKYWELL_TARGET;
  const base = createLivingWorldChapterMediaModel({ ...predecessor, progress: 8 }, 8, language);
  return Object.freeze({
    width: LIVING_WORLD_SKYWELL_MEDIA_WIDTH,
    height: LIVING_WORLD_SKYWELL_MEDIA_HEIGHT,
    type: LIVING_WORLD_SKYWELL_MEDIA_TYPE,
    filename: LIVING_WORLD_SKYWELL_MEDIA_FILENAME,
    locale: language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    current,
    target: LIVING_WORLD_SKYWELL_TARGET,
    complete,
    worldIdentity: c.world,
    eventTitle: c.title,
    invitation: complete ? c.completeInvitation : c.partialInvitation,
    progress: formatLivingWorldSkywellCopy(c.progress, values),
    alternative: formatLivingWorldSkywellCopy(
      complete ? c.completeAlternative : c.partialAlternative,
      values,
    ),
    signature: 'Creatorverse',
    base,
  });
}

export function createLivingWorldSkywellSharePayload(model, url) {
  if (!model || model.filename !== LIVING_WORLD_SKYWELL_MEDIA_FILENAME || model.type !== LIVING_WORLD_SKYWELL_MEDIA_TYPE) {
    throw new Error('INVALID_SKYWELL_MEDIA_MODEL');
  }
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || !parsed.hash.startsWith('#skywell=')) {
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
  } catch { return fallback; }
}

function palette(documentLike) {
  return {
    sky: cssColor(documentLike, '--cv-world-sky', '#111722'),
    skyRaised: cssColor(documentLike, '--cv-world-sky-raised', '#1b2330'),
    farStone: cssColor(documentLike, '--cv-world-far-stone', '#29313b'),
    nearStone: cssColor(documentLike, '--cv-world-near-stone', '#171d25'),
    mist: cssColor(documentLike, '--cv-world-mist', '#343f49'),
    stone: cssColor(documentLike, '--cv-world-stone-line', '#626970'),
    thread: cssColor(documentLike, '--cv-world-thread', '#efcf72'),
    bright: cssColor(documentLike, '--cv-world-thread-bright', '#ffe69a'),
    deep: cssColor(documentLike, '--cv-world-thread-deep', '#5b4b24'),
    muted: cssColor(documentLike, '--cv-world-thread-muted', '#9f8851'),
    plant: cssColor(documentLike, '--cv-world-plant', '#7d9d78'),
    text: cssColor(documentLike, '--cv-color-text', '#f5f7fb'),
    textMuted: cssColor(documentLike, '--cv-color-text-muted', '#a8afbd'),
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

function point(cx, cy, radius, degrees) {
  const angle = degrees * Math.PI / 180;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function drawCompletedWorld(context, p) {
  context.fillStyle = p.sky;
  context.fillRect(0, 0, 1080, 1920);
  polygon(context, [[0, 300], [170, 245], [360, 330], [535, 270], [735, 355], [910, 280], [1080, 340], [1080, 990], [0, 990]], p.skyRaised);
  polygon(context, [[0, 960], [180, 820], [390, 905], [570, 760], [790, 920], [1080, 810], [1080, 1435], [0, 1435]], p.farStone, p.stone, 5);
  polygon(context, [[0, 1260], [190, 1175], [385, 1285], [580, 1180], [785, 1300], [940, 1205], [1080, 1265], [1080, 1585], [0, 1585]], p.nearStone, p.stone, 5);

  context.lineCap = 'round';
  context.strokeStyle = p.stone;
  context.lineWidth = 12;
  context.beginPath();
  context.moveTo(95, 1370);
  context.quadraticCurveTo(330, 1500, 555, 1275);
  context.stroke();
  context.beginPath();
  context.moveTo(105, 1435);
  context.quadraticCurveTo(345, 1550, 575, 1330);
  context.stroke();
  for (let index = 0; index < 12; index += 1) {
    const t = index / 11;
    const x = 145 + index * 34;
    const y = 1392 + Math.sin(t * Math.PI) * 74 - index * 9;
    polygon(context, [[x, y], [x + 33, y - 5], [x + 39, y + 19], [x + 6, y + 25]], p.thread, p.deep, 3);
  }

  context.strokeStyle = p.bright;
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(510, 1325);
  context.bezierCurveTo(625, 1250, 675, 1125, 875, 1030);
  context.stroke();
  for (let index = 0; index < 8; index += 1) {
    const x = 580 + index * 48;
    const y = 1205 - Math.round(Math.sin((index / 7) * Math.PI) * 95) - index * 13;
    context.strokeStyle = p.bright;
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(x, y + 102);
    context.lineTo(x + 12, y + 30);
    context.stroke();
    context.fillStyle = p.bright;
    context.beginPath();
    context.arc(x + 12, y + 24, 15, 0, Math.PI * 2);
    context.fill();
    polygon(context, [[x - 14, y + 25], [x + 4, y + 5], [x + 6, y + 55], [x - 10, y + 66]], p.deep, p.stone, 3);
    polygon(context, [[x + 21, y + 5], [x + 42, y + 25], [x + 33, y + 67], [x + 18, y + 54]], p.deep, p.stone, 3);
    context.fillStyle = p.plant;
    context.fillRect(x - 5, y + 110, 42, 7);
  }

  context.fillStyle = p.mist;
  context.globalAlpha = 0.64;
  context.fillRect(0, 1400, 1080, 110);
  context.globalAlpha = 1;
}

function drawSkywell(context, model, p) {
  const cx = 540;
  const cy = 620;
  const aperture = 58 + model.current * 18;

  context.save();
  context.fillStyle = p.skyRaised;
  context.beginPath();
  context.arc(cx, cy, aperture, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = p.deep;
  context.lineWidth = 28;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(720, 1125);
  context.bezierCurveTo(660, 970, 600, 825, 540, cy + aperture);
  context.stroke();
  context.strokeStyle = model.complete ? p.bright : p.thread;
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(720, 1125);
  context.bezierCurveTo(660, 970, 600, 825, 540, cy + aperture);
  context.stroke();

  RIB_ANGLES.forEach((angle, index) => {
    const open = index < model.current;
    const target = index === model.current && !model.complete;
    const inner = point(cx, cy, aperture + 4, angle);
    const outer = point(cx, cy, open ? 255 : 160, angle);
    const hinge = point(cx, cy, open ? aperture + 42 : aperture + 16, angle);
    context.strokeStyle = open ? p.bright : target ? p.thread : p.stone;
    context.lineWidth = open ? 18 : target ? 16 : 11;
    context.setLineDash(target ? [20, 12] : []);
    context.beginPath();
    context.moveTo(inner.x, inner.y);
    context.quadraticCurveTo(hinge.x, hinge.y, outer.x, outer.y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = open ? p.bright : p.skyRaised;
    context.strokeStyle = open ? p.thread : target ? p.bright : p.stone;
    context.lineWidth = 7;
    context.beginPath();
    context.arc(inner.x, inner.y, open ? 18 : 15, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });

  context.strokeStyle = model.complete ? p.bright : p.muted;
  context.lineWidth = model.complete ? 15 : 9;
  context.setLineDash(model.complete ? [] : [24, 18]);
  context.beginPath();
  context.arc(cx, cy, 270, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.restore();
}

function drawText(context, model, p) {
  const rtl = model.direction === 'rtl';
  const x = rtl ? 996 : 84;
  context.direction = rtl ? 'rtl' : 'ltr';
  context.textAlign = rtl ? 'right' : 'left';
  context.textBaseline = 'alphabetic';
  const write = (value, y, size, weight, color) => {
    context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.lineWidth = Math.max(3, size * 0.06);
    context.strokeStyle = p.nearStone;
    context.strokeText(value, x, y, 912);
    context.fillStyle = color;
    context.fillText(value, x, y, 912);
  };
  write(model.worldIdentity, 145, 38, 750, p.thread);
  write(model.eventTitle, 245, model.locale === 'ar' ? 62 : 66, 800, p.text);
  write(model.invitation, 1650, model.locale === 'ar' ? 48 : 52, 800, p.text);
  write(model.progress, 1732, model.locale === 'ar' ? 38 : 40, 650, p.textMuted);
  write(model.signature, 1866, 30, 750, p.thread);
}

export async function renderLivingWorldSkywellMedia(model, { documentLike = globalThis.document } = {}) {
  if (!documentLike?.createElement || model?.width !== 1080 || model?.height !== 1920) {
    throw new Error('SKYWELL_MEDIA_RENDER_UNAVAILABLE');
  }
  const canvas = documentLike.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('SKYWELL_MEDIA_RENDER_UNAVAILABLE');
  const p = palette(documentLike);
  drawCompletedWorld(context, p);
  drawSkywell(context, model, p);
  context.fillStyle = p.nearStone;
  context.fillRect(0, 1510, 1080, 410);
  drawText(context, model, p);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value && value.type === 'image/png' && value.size > 1024
      ? resolve(value)
      : reject(new Error('SKYWELL_MEDIA_RENDER_FAILED')), 'image/png');
  });
  return Object.freeze({ blob, width: 1080, height: 1920 });
}
