import {
  LIVING_WORLD_CHAPTER_MEDIA_HEIGHT,
  LIVING_WORLD_CHAPTER_MEDIA_TYPE,
  LIVING_WORLD_CHAPTER_MEDIA_WIDTH,
} from './living-world-chapter-media.js';
import { projectReturningThreadMedia } from './living-world-returning-thread.js';

function cssColor(documentLike, property, fallback) {
  try {
    return documentLike.defaultView?.getComputedStyle(documentLike.documentElement).getPropertyValue(property).trim() || fallback;
  } catch {
    return fallback;
  }
}

async function decodeImage(blob, documentLike) {
  if (typeof globalThis.createImageBitmap === 'function') return globalThis.createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const image = documentLike.createElement('img');
    const url = URL.createObjectURL(blob);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('RETURNING_THREAD_MEDIA_DECODE_FAILED')); };
    image.src = url;
  });
}

function bridgePoint(t) {
  const x = 165 + 625 * t;
  const y = 1290 + Math.sin(t * Math.PI) * 105 - 250 * t;
  return { x, y };
}

function lanternPoint(index) {
  const x = 365 + index * 76 + 18;
  const y = 780 - Math.sin((index / 7) * Math.PI) * 130 - index * 22 + 32;
  return { x, y };
}

function strokePath(context, points, color, width) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'butt';
  context.lineJoin = 'miter';
  context.stroke();
}

function sampleBridge(count = 32, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const point = bridgePoint(index / (count - 1));
    return { x: point.x, y: point.y + offset };
  });
}

function drawOffsetWeft(context, color, deep) {
  strokePath(context, sampleBridge(36), color, 8);
  context.strokeStyle = deep;
  context.lineWidth = 5;
  for (const t of [0.18, 0.34, 0.5, 0.66, 0.82]) {
    const point = bridgePoint(t);
    context.beginPath();
    context.moveTo(point.x - 9, point.y - 10);
    context.lineTo(point.x + 9, point.y + 10);
    context.stroke();
  }
}

function drawFoldedBraid(context, color, deep) {
  strokePath(context, sampleBridge(36, -5), color, 7);
  strokePath(context, sampleBridge(36, 5), deep, 7);
  context.strokeStyle = color;
  context.lineWidth = 5;
  for (const t of [0.25, 0.5, 0.75]) {
    const point = bridgePoint(t);
    context.beginPath();
    context.moveTo(point.x - 8, point.y - 11);
    context.lineTo(point.x + 8, point.y + 11);
    context.stroke();
  }
}

function drawNotchedSpine(context, color, deep) {
  strokePath(context, sampleBridge(36), color, 8);
  context.strokeStyle = deep;
  context.lineWidth = 5;
  for (let index = 1; index <= 6; index += 1) {
    const point = bridgePoint(index / 7);
    const direction = index % 2 ? -1 : 1;
    context.beginPath();
    context.moveTo(point.x - 8, point.y);
    context.lineTo(point.x - 8, point.y + direction * 13);
    context.lineTo(point.x + 8, point.y + direction * 13);
    context.lineTo(point.x + 8, point.y);
    context.stroke();
  }
}

function drawTwinLatch(context, color, deep) {
  strokePath(context, sampleBridge(36, -6), color, 6);
  strokePath(context, sampleBridge(36, 6), deep, 6);
  context.strokeStyle = color;
  context.lineWidth = 5;
  for (let index = 1; index <= 5; index += 1) {
    const point = bridgePoint(index / 6);
    const direction = index % 2 ? 1 : -1;
    context.beginPath();
    context.moveTo(point.x - 8, point.y - 6 * direction);
    context.lineTo(point.x, point.y + 6 * direction);
    context.lineTo(point.x + 8, point.y - 6 * direction);
    context.stroke();
  }
}

function drawBridgeThread(context, kind, color, deep) {
  if (kind === 'offset-weft') drawOffsetWeft(context, color, deep);
  else if (kind === 'folded-braid') drawFoldedBraid(context, color, deep);
  else if (kind === 'notched-spine') drawNotchedSpine(context, color, deep);
  else drawTwinLatch(context, color, deep);
}

function drawExtension(context, projection, color, deep) {
  if (!projection.extended) return;
  const start = bridgePoint(1);
  const end = lanternPoint(projection.lanternIndex);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.bezierCurveTo(start.x + 35, start.y - 72, end.x - 70, end.y + 65, end.x, end.y);
  context.strokeStyle = color;
  context.lineWidth = 8;
  context.lineCap = 'butt';
  context.stroke();
  context.strokeStyle = deep;
  context.lineWidth = 4;
  for (const t of [0.28, 0.52, 0.76]) {
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t - Math.sin(t * Math.PI) * 45;
    context.beginPath();
    context.moveTo(x - 7, y - 6);
    context.lineTo(x + 7, y + 6);
    context.stroke();
  }
}

export async function renderReturningThreadChapterMedia(baseBlob, thread, options = {}) {
  const documentLike = options.documentLike || globalThis.document;
  if (!baseBlob || baseBlob.type !== LIVING_WORLD_CHAPTER_MEDIA_TYPE || !documentLike?.createElement) {
    throw new Error('RETURNING_THREAD_MEDIA_UNAVAILABLE');
  }
  const projection = projectReturningThreadMedia(thread, {
    extended: options.extended === true,
    lanternIndex: options.extended === true ? options.lanternIndex : null,
  });
  const source = await decodeImage(baseBlob, documentLike);
  const canvas = documentLike.createElement('canvas');
  canvas.width = LIVING_WORLD_CHAPTER_MEDIA_WIDTH;
  canvas.height = LIVING_WORLD_CHAPTER_MEDIA_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('RETURNING_THREAD_MEDIA_UNAVAILABLE');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const color = cssColor(documentLike, '--cv-world-thread-bright', '#ffe69a');
  const deep = cssColor(documentLike, '--cv-world-thread-deep', '#5b4b24');
  drawBridgeThread(context, projection.kind, color, deep);
  drawExtension(context, projection, color, deep);
  source.close?.();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value && value.type === LIVING_WORLD_CHAPTER_MEDIA_TYPE && value.size > 1024
      ? resolve(value)
      : reject(new Error('RETURNING_THREAD_MEDIA_RENDER_FAILED')), LIVING_WORLD_CHAPTER_MEDIA_TYPE);
  });
  return Object.freeze({ blob, width: canvas.width, height: canvas.height, projection });
}
