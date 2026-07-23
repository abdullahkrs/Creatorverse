const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 560;
const LANTERN_COUNT = 8;

const CAMERA_PRESETS = Object.freeze([
  Object.freeze({ maxWidth: 479, width: 420, height: 560, y: -50, anchorInline: 0.69 }),
  Object.freeze({ maxWidth: 899, width: 620, height: 560, y: -50, anchorInline: 0.64 }),
  Object.freeze({ maxWidth: 1279, width: 720, height: 540, y: -40, anchorInline: 0.64 }),
  Object.freeze({ maxWidth: Number.POSITIVE_INFINITY, width: 800, height: 500, y: -25, anchorInline: 0.64 }),
]);

function finiteInteger(value, minimum, maximum, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code);
  return parsed;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getRelayLanternPoint(index) {
  const bounded = finiteInteger(index, 0, LANTERN_COUNT - 1, 'INVALID_RELAY_FOCUS_TARGET');
  const x = 430 + bounded * 37;
  const y = 230 - Math.round(Math.sin((bounded / 7) * Math.PI) * 56) - bounded * 4;
  return Object.freeze({ x: x + 11, y: y + 34 });
}

export function createRelayWorldCamera(targetIndex, {
  viewportWidth = 390,
  viewportHeight = 844,
  complete = false,
} = {}) {
  const width = Number.isFinite(Number(viewportWidth)) && Number(viewportWidth) > 0 ? Number(viewportWidth) : 390;
  const height = Number.isFinite(Number(viewportHeight)) && Number(viewportHeight) > 0 ? Number(viewportHeight) : 844;

  if (complete) {
    return Object.freeze({
      x: 0,
      y: 0,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      targetX: null,
      targetY: null,
      targetInlineRatio: null,
      targetBlockRatio: null,
      viewportWidth: width,
      viewportHeight: height,
    });
  }

  const target = getRelayLanternPoint(targetIndex);
  const preset = CAMERA_PRESETS.find(item => width <= item.maxWidth) || CAMERA_PRESETS.at(-1);
  const preferredX = target.x - preset.width * preset.anchorInline;
  const x = clamp(preferredX, -24, WORLD_WIDTH - preset.width + 24);

  return Object.freeze({
    x: Math.round(x * 100) / 100,
    y: preset.y,
    width: preset.width,
    height: preset.height,
    targetX: target.x,
    targetY: target.y,
    targetInlineRatio: (target.x - x) / preset.width,
    targetBlockRatio: (target.y - preset.y) / preset.height,
    viewportWidth: width,
    viewportHeight: height,
  });
}

export function projectRelayLanternState({ active, target, connected, phase }) {
  if (phase === 'stale' || phase === 'complete') return active ? 'active' : 'dormant';
  if (connected) return 'accepted';
  if (target) return 'target';
  return active ? 'active' : 'dormant';
}
