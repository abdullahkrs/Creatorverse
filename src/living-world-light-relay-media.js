import {
  createLivingWorldChapterMediaModel,
  renderLivingWorldChapterMedia,
} from './living-world-chapter-media.js';
import {
  decodeLightRelayChapter,
  decodeLivingWorldLightRelay,
  encodeLivingWorldLightRelay,
} from './living-world-light-relay.js';
import {
  formatLivingWorldLightRelayCopy,
  getLivingWorldLightRelayCopy,
} from './living-world-light-relay-i18n.js';

export const LIVING_WORLD_LIGHT_RELAY_MEDIA_WIDTH = 1080;
export const LIVING_WORLD_LIGHT_RELAY_MEDIA_HEIGHT = 1920;
export const LIVING_WORLD_LIGHT_RELAY_MEDIA_TYPE = 'image/png';
export const LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME = 'creatorverse-carry-light.png';
export const LIVING_WORLD_LIGHT_RELAY_MEDIA_SCENE_BOUNDS = Object.freeze({ x: 0, y: 220, width: 1080, height: 1320 });
export const LIVING_WORLD_LIGHT_RELAY_MEDIA_TEXT_BOUNDS = Object.freeze({ x: 84, y: 1540, width: 912, height: 235 });

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function localizedNumber(value, locale) {
  const plain = String(value);
  if (locale !== 'ar') return plain;
  return plain.replace(/\d/gu, digit => ARABIC_DIGITS[Number(digit)]);
}

function canonicalRelay(relay, options = {}) {
  const token = typeof relay === 'string' ? relay : encodeLivingWorldLightRelay(relay, options);
  return decodeLivingWorldLightRelay(token, options);
}

export function createLivingWorldLightRelayMediaModel(relay, locale = 'en', options = {}) {
  const validated = canonicalRelay(relay, options);
  const chapter = decodeLightRelayChapter(validated, options);
  const language = locale === 'ar' ? 'ar' : 'en';
  const c = getLivingWorldLightRelayCopy(language).media;
  const current = validated.progress;
  const values = { current: localizedNumber(current, language) };
  const base = createLivingWorldChapterMediaModel(chapter, current, language);
  return Object.freeze({
    width: LIVING_WORLD_LIGHT_RELAY_MEDIA_WIDTH,
    height: LIVING_WORLD_LIGHT_RELAY_MEDIA_HEIGHT,
    type: LIVING_WORLD_LIGHT_RELAY_MEDIA_TYPE,
    filename: LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME,
    locale: language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    current,
    target: 8,
    targetIndex: validated.targetIndex,
    worldIdentity: c.world,
    eventTitle: c.title,
    invitation: c.invitation,
    progress: formatLivingWorldLightRelayCopy(c.progress, values),
    alternative: formatLivingWorldLightRelayCopy(c.alternative, values),
    signature: 'Creatorverse',
    base,
    sceneRatio: LIVING_WORLD_LIGHT_RELAY_MEDIA_SCENE_BOUNDS.height / LIVING_WORLD_LIGHT_RELAY_MEDIA_HEIGHT,
  });
}

export function createLivingWorldLightRelaySharePayload(model, url) {
  if (!model || model.filename !== LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME || model.type !== LIVING_WORLD_LIGHT_RELAY_MEDIA_TYPE) {
    throw new Error('INVALID_LIGHT_RELAY_MEDIA_MODEL');
  }
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || !parsed.hash.startsWith('#world-relay=')) {
    throw new Error('INVALID_LIGHT_RELAY_MEDIA_URL');
  }
  return Object.freeze({ title: model.eventTitle, text: model.invitation, url: parsed.toString() });
}

export function supportsLivingWorldLightRelayFileShare(navigatorLike, file) {
  if (typeof navigatorLike?.share !== 'function' || typeof navigatorLike?.canShare !== 'function') return false;
  try { return navigatorLike.canShare({ files: [file] }) === true; } catch { return false; }
}

function cssColor(documentLike, property, fallback) {
  try {
    return documentLike.defaultView?.getComputedStyle(documentLike.documentElement).getPropertyValue(property).trim() || fallback;
  } catch { return fallback; }
}

function targetCoordinates(index) {
  const x = 365 + index * 76;
  const y = 780 - Math.sin((index / 7) * Math.PI) * 130 - index * 22;
  return { x: x + 18, y: y + 145 };
}

async function imageFromBlob(blob, documentLike) {
  if (typeof globalThis.createImageBitmap === 'function') return globalThis.createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const image = documentLike.createElement('img');
    const url = URL.createObjectURL(blob);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('LIGHT_RELAY_MEDIA_RENDER_UNAVAILABLE')); };
    image.src = url;
  });
}

function drawRelayStructure(context, model, documentLike) {
  const thread = cssColor(documentLike, '--cv-world-thread-bright', '#ffe69a');
  const deep = cssColor(documentLike, '--cv-world-thread-deep', '#5b4b24');
  const line = cssColor(documentLike, '--cv-world-stone-line', '#626970');
  const previous = targetCoordinates(Math.max(0, model.targetIndex - 1));
  const target = targetCoordinates(model.targetIndex);
  const endX = target.x - (target.x - previous.x) * 0.18;
  const endY = target.y - (target.y - previous.y) * 0.18;

  context.save();
  context.strokeStyle = deep;
  context.lineWidth = 16;
  context.lineCap = 'round';
  context.setLineDash([34, 24]);
  context.beginPath();
  context.moveTo(previous.x, previous.y);
  context.bezierCurveTo(previous.x + 42, previous.y - 72, endX - 42, endY + 48, endX, endY);
  context.stroke();

  context.strokeStyle = thread;
  context.lineWidth = 8;
  context.setLineDash([28, 26]);
  context.beginPath();
  context.moveTo(previous.x, previous.y);
  context.bezierCurveTo(previous.x + 42, previous.y - 72, endX - 42, endY + 48, endX, endY);
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = line;
  context.lineWidth = 7;
  context.strokeRect(target.x - 22, target.y - 12, 34, 26);
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX + 18, endY - 12);
  context.stroke();
  context.restore();
}

function drawRelayText(context, model, documentLike) {
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
  write(model.eventTitle, 245, model.locale === 'ar' ? 64 : 68, 800, text);
  write(model.invitation, 1625, model.locale === 'ar' ? 50 : 52, 800, text);
  write(model.progress, 1710, model.locale === 'ar' ? 38 : 40, 650, muted);
  write(model.signature, 1866, 30, 750, accent);
}

export async function renderLivingWorldLightRelayMedia(model, { documentLike = globalThis.document } = {}) {
  if (!documentLike?.createElement || model?.width !== 1080 || model?.height !== 1920) {
    throw new Error('LIGHT_RELAY_MEDIA_RENDER_UNAVAILABLE');
  }
  const base = await renderLivingWorldChapterMedia(model.base, { documentLike });
  const image = await imageFromBlob(base.blob, documentLike);
  const canvas = documentLike.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('LIGHT_RELAY_MEDIA_RENDER_UNAVAILABLE');
  context.drawImage(image, 0, 0, 1080, 1920);
  image.close?.();
  context.fillStyle = cssColor(documentLike, '--cv-world-near-stone', '#171d25');
  context.fillRect(0, 1488, 1080, 432);
  drawRelayStructure(context, model, documentLike);
  drawRelayText(context, model, documentLike);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value && value.type === 'image/png' && value.size > 1024
      ? resolve(value)
      : reject(new Error('LIGHT_RELAY_MEDIA_RENDER_FAILED')), 'image/png');
  });
  return Object.freeze({ blob, width: 1080, height: 1920 });
}
