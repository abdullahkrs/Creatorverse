import {
  createLivingWorldChapterMediaModel,
  renderLivingWorldChapterMedia,
} from './living-world-chapter-media.js';
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

async function imageFromBlob(blob, documentLike) {
  if (typeof globalThis.createImageBitmap === 'function') return globalThis.createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const image = documentLike.createElement('img');
    const url = URL.createObjectURL(blob);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SKYWELL_MEDIA_RENDER_UNAVAILABLE')); };
    image.src = url;
  });
}

function point(cx, cy, radius, degrees) {
  const angle = degrees * Math.PI / 180;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function drawSkywell(context, model, documentLike) {
  const sky = cssColor(documentLike, '--cv-world-sky-raised', '#1b2330');
  const thread = cssColor(documentLike, '--cv-world-thread', '#efcf72');
  const bright = cssColor(documentLike, '--cv-world-thread-bright', '#ffe69a');
  const stone = cssColor(documentLike, '--cv-world-stone-line', '#626970');
  const deep = cssColor(documentLike, '--cv-world-thread-deep', '#5b4b24');
  const muted = cssColor(documentLike, '--cv-world-thread-muted', '#9f8851');
  const cx = 540;
  const cy = 610;
  const aperture = 58 + model.current * 18;

  context.save();
  context.fillStyle = sky;
  context.beginPath();
  context.arc(cx, cy, aperture, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = deep;
  context.lineWidth = 28;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(540, 1210);
  context.bezierCurveTo(526, 1020, 570, 850, 540, cy + aperture);
  context.stroke();
  context.strokeStyle = model.complete ? bright : thread;
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(540, 1210);
  context.bezierCurveTo(526, 1020, 570, 850, 540, cy + aperture);
  context.stroke();

  RIB_ANGLES.forEach((angle, index) => {
    const open = index < model.current;
    const target = index === model.current && !model.complete;
    const inner = point(cx, cy, aperture + 4, angle);
    const outer = point(cx, cy, open ? 255 : 160, angle);
    const hinge = point(cx, cy, open ? aperture + 42 : aperture + 16, angle);
    context.strokeStyle = open ? bright : target ? thread : stone;
    context.lineWidth = open ? 18 : target ? 16 : 11;
    context.setLineDash(target ? [20, 12] : []);
    context.beginPath();
    context.moveTo(inner.x, inner.y);
    context.quadraticCurveTo(hinge.x, hinge.y, outer.x, outer.y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = open ? bright : sky;
    context.strokeStyle = open ? thread : target ? bright : stone;
    context.lineWidth = 7;
    context.beginPath();
    context.arc(inner.x, inner.y, open ? 18 : 15, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });

  context.strokeStyle = model.complete ? bright : muted;
  context.lineWidth = model.complete ? 15 : 9;
  context.setLineDash(model.complete ? [] : [24, 18]);
  context.beginPath();
  context.arc(cx, cy, 270, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.restore();
}

function drawText(context, model, documentLike) {
  const text = cssColor(documentLike, '--cv-color-text', '#f5f7fb');
  const muted = cssColor(documentLike, '--cv-color-text-muted', '#a8afbd');
  const accent = cssColor(documentLike, '--cv-world-thread', '#efcf72');
  const outline = cssColor(documentLike, '--cv-world-near-stone', '#171d25');
  const rtl = model.direction === 'rtl';
  const x = rtl ? 996 : 84;
  context.direction = rtl ? 'rtl' : 'ltr';
  context.textAlign = rtl ? 'right' : 'left';
  context.textBaseline = 'alphabetic';
  const write = (value, y, size, weight, color) => {
    context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.lineWidth = Math.max(3, size * 0.06);
    context.strokeStyle = outline;
    context.strokeText(value, x, y, 912);
    context.fillStyle = color;
    context.fillText(value, x, y, 912);
  };
  write(model.worldIdentity, 145, 38, 750, accent);
  write(model.eventTitle, 245, model.locale === 'ar' ? 62 : 66, 800, text);
  write(model.invitation, 1650, model.locale === 'ar' ? 48 : 52, 800, text);
  write(model.progress, 1732, model.locale === 'ar' ? 38 : 40, 650, muted);
  write(model.signature, 1866, 30, 750, accent);
}

export async function renderLivingWorldSkywellMedia(model, { documentLike = globalThis.document } = {}) {
  if (!documentLike?.createElement || model?.width !== 1080 || model?.height !== 1920) {
    throw new Error('SKYWELL_MEDIA_RENDER_UNAVAILABLE');
  }
  const base = await renderLivingWorldChapterMedia(model.base, { documentLike });
  const image = await imageFromBlob(base.blob, documentLike);
  const canvas = documentLike.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('SKYWELL_MEDIA_RENDER_UNAVAILABLE');
  context.drawImage(image, 0, 0, 1080, 1920);
  image.close?.();
  context.fillStyle = cssColor(documentLike, '--cv-world-sky', '#111722');
  context.fillRect(0, 300, 1080, 850);
  drawSkywell(context, model, documentLike);
  context.fillStyle = cssColor(documentLike, '--cv-world-near-stone', '#171d25');
  context.fillRect(0, 1488, 1080, 432);
  drawText(context, model, documentLike);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value && value.type === 'image/png' && value.size > 1024
      ? resolve(value)
      : reject(new Error('SKYWELL_MEDIA_RENDER_FAILED')), 'image/png');
  });
  return Object.freeze({ blob, width: 1080, height: 1920 });
}
