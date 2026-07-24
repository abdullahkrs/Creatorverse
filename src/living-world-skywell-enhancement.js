import { getLocale, setLocale } from './i18n.js';
import { LIVING_WORLD_SOUND_KEY } from './living-world-event.js';
import {
  chapterFromLocation,
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  readLivingWorldChapterState,
} from './living-world-chapter.js';
import {
  buildLivingWorldSkywellUrl,
  commitLivingWorldSkywellContribution,
  createOrResumeLivingWorldSkywell,
  decodeLivingWorldSkywell,
  deriveLivingWorldSkywellRibs,
  encodeLivingWorldSkywell,
  evaluateLivingWorldSkywellLocks,
  isLivingWorldSkywellLaunchEligible,
  LIVING_WORLD_SKYWELL_OWNER_KEY,
  LIVING_WORLD_SKYWELL_ROUTE_KEY,
  LIVING_WORLD_SKYWELL_SAFE_FRAGMENT,
  LIVING_WORLD_SKYWELL_TARGET,
  resolveLivingWorldSkywell,
  skywellFromLocation,
} from './living-world-skywell.js';
import {
  formatLivingWorldSkywellCopy,
  getLivingWorldSkywellCopy,
} from './living-world-skywell-i18n.js';
import {
  createLivingWorldSkywellMediaModel,
  createLivingWorldSkywellSharePayload,
  LIVING_WORLD_SKYWELL_MEDIA_FILENAME,
  renderLivingWorldSkywellMedia,
  supportsLivingWorldSkywellFileShare,
} from './living-world-skywell-media.js';

const TEST_WINDOW_MS = '__CREATORVERSE_SKYWELL_WINDOW_MS__';
const TEST_IMPACT_MS = '__CREATORVERSE_SKYWELL_IMPACT_MS__';
const TEST_FLAG = '__CREATORVERSE_SKYWELL_TEST__';
const TEST_CONTROL = '__CREATORVERSE_SKYWELL_TEST_CONTROL__';
const RIB_ANGLES = Object.freeze([145, 180, 215, 325, 0, 35]);
const SVG_NS = 'http://www.w3.org/2000/svg';
const app = document.querySelector('#app');

let runtime = null;
let frame = 0;
let impactTimer = 0;
let shareObjectUrl = '';
let audioContext = null;
let observerQueued = false;

function c() { return getLivingWorldSkywellCopy(getLocale()); }
function isArabic() { return getLocale() === 'ar'; }
function safeStorage(action, fallback = null) { try { return action(); } catch { return fallback; } }
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function localizedNumber(value) {
  return new Intl.NumberFormat(isArabic() ? 'ar' : 'en', { useGrouping: false }).format(value);
}
function interpolate(template, values) {
  return formatLivingWorldSkywellCopy(template, Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === 'number' ? localizedNumber(value) : value]),
  ));
}
function syncLocale() {
  document.documentElement.lang = getLocale();
  document.documentElement.dir = isArabic() ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isArabic());
}
function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
function soundSupported() { return Boolean(globalThis.AudioContext || globalThis.webkitAudioContext); }
function soundEnabled() {
  return soundSupported() && safeStorage(() => localStorage.getItem(LIVING_WORLD_SOUND_KEY) === 'on', false);
}
function clearTimers() {
  cancelAnimationFrame(frame);
  clearTimeout(impactTimer);
  frame = 0;
  impactTimer = 0;
}
function revokeShareUrl() {
  if (!shareObjectUrl) return;
  try { URL.revokeObjectURL(shareObjectUrl); } catch {}
  shareObjectUrl = '';
}
function playCue(type) {
  if (!soundEnabled()) return;
  const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Constructor) return;
  try {
    if (!audioContext) audioContext = new Constructor();
    audioContext.resume?.();
    const patterns = {
      start: [[196, 0, 0.12, 0.025]],
      pass: [[330, 0, 0.08, 0.03]],
      miss: [[145, 0, 0.08, 0.02]],
      rib: [[330, 0, 0.1, 0.03], [440, 0.1, 0.17, 0.03]],
      complete: [[294, 0, 0.1, 0.035], [392, 0.12, 0.12, 0.035], [523, 0.28, 0.7, 0.025]],
    };
    const now = audioContext.currentTime;
    for (const [frequency, delay, duration, gainValue] of patterns[type] || []) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(gainValue, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.02);
    }
  } catch {}
}

function emblem() {
  return `<svg class="chapter-emblem" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(c().aria.emblem)}"><path d="M5 24V9l5-4v15m17 4V9l-5-4v15M10 12h12M10 17h12M10 22h12"/></svg>`;
}
function utilities() {
  const supported = soundSupported();
  const enabled = soundEnabled();
  return `<div class="chapter-utilities" aria-label="${escapeHtml(c().aria.utility)}">
    <div class="chapter-language" aria-label="${escapeHtml(c().world.language)}">
      <button type="button" data-skywell-locale="en" aria-pressed="${getLocale() === 'en'}" aria-label="${escapeHtml(c().world.english)}">EN</button>
      <button type="button" data-skywell-locale="ar" aria-pressed="${getLocale() === 'ar'}" aria-label="${escapeHtml(c().world.arabic)}">ع</button>
    </div>
    <button class="chapter-sound" type="button" data-skywell-sound aria-pressed="${enabled}" ${supported ? '' : 'disabled'} aria-label="${escapeHtml(supported ? (enabled ? c().world.soundOn : c().world.soundOff) : c().world.soundUnavailable)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6L9 10H5Zm12-1q2 3 0 6"/></svg>
    </button>
  </div>`;
}
function creatorStrip() {
  const label = runtime?.event?.creatorName ? `${runtime.event.creatorName} · ${c().creator.world}` : c().creator.realm;
  return `<header class="chapter-creator-strip">
    <div class="chapter-creator">${emblem()}<span><bdi>${escapeHtml(label)}</bdi></span><small>${escapeHtml(c().creator.live)}</small></div>
    ${utilities()}
  </header>`;
}

function point(cx, cy, radius, degrees) {
  const radians = degrees * Math.PI / 180;
  return { x: cx + Math.cos(radians) * radius, y: cy + Math.sin(radians) * radius };
}
function ribMarkup(progress, phase) {
  const ribs = deriveLivingWorldSkywellRibs(progress, { phase, acceptedIndex: runtime?.acceptedIndex });
  const aperture = 34 + progress * 9;
  return ribs.map(rib => {
    const angle = RIB_ANGLES[rib.index];
    const inner = point(400, 210, aperture + 3, angle);
    const hinge = point(400, 210, rib.open || rib.impact ? aperture + 34 : aperture + 14, angle);
    const outer = point(400, 210, rib.open || rib.impact ? 148 : 88, angle);
    const classes = ['skywell-rib'];
    if (rib.open) classes.push('is-open');
    if (rib.target) classes.push('is-target');
    if (rib.impact) classes.push('is-impact');
    if (rib.dormant) classes.push('is-dormant');
    return `<g class="${classes.join(' ')}" data-skywell-rib="${rib.index}" ${rib.target ? 'data-skywell-target="true"' : ''}>
      <path class="skywell-rib-edge" d="M${inner.x.toFixed(1)} ${inner.y.toFixed(1)} Q${hinge.x.toFixed(1)} ${hinge.y.toFixed(1)} ${outer.x.toFixed(1)} ${outer.y.toFixed(1)}"/>
      <circle class="skywell-rib-hinge" cx="${inner.x.toFixed(1)}" cy="${inner.y.toFixed(1)}" r="${rib.open ? 11 : 9}"/>
      <path class="skywell-rib-cradle" d="M${(outer.x - 10).toFixed(1)} ${(outer.y - 7).toFixed(1)}h20v14h-20z"/>
    </g>`;
  }).join('');
}
function skyWedges(progress) {
  return RIB_ANGLES.map((angle, index) => {
    if (index >= progress) return '';
    const left = point(400, 210, 36, angle - 15);
    const right = point(400, 210, 140, angle + 15);
    return `<path class="skywell-sky-wedge" d="M400 210L${left.x.toFixed(1)} ${left.y.toFixed(1)}L${right.x.toFixed(1)} ${right.y.toFixed(1)}Z"/>`;
  }).join('');
}
function lanternMarkup() {
  return Array.from({ length: 8 }, (_, index) => {
    const x = 270 + index * 36;
    const y = 488 - Math.round(Math.sin((index / 7) * Math.PI) * 42) - index * 2;
    return `<g class="signal-lantern is-active" data-lantern-index="${index}" transform="translate(${x} ${y})">
      <path class="lantern-stem" d="M0 92 8 29 21 92Z"/>
      <path class="lantern-shutter lantern-shutter-start" d="M-12 31 3 12 7 51-9 61Z"/>
      <path class="lantern-shutter lantern-shutter-end" d="M13 11 31 31 25 62 10 51Z"/>
      <circle class="lantern-core" cx="9" cy="28" r="8"/>
      <path class="lantern-path" d="M9 90 42 99"/>
      <path class="lantern-detail" d="M-6 105h40m-29 7 8-7 7 7"/>
    </g>`;
  }).join('');
}
function worldScene(progress, phase) {
  const complete = progress >= LIVING_WORLD_SKYWELL_TARGET;
  const aperture = 34 + progress * 9;
  return `<svg class="skywell-world ${complete ? 'is-complete' : ''} ${phase === 'impact' ? 'is-impacting' : ''} ${phase === 'active' ? 'is-active' : ''}" viewBox="0 0 800 760" role="img" aria-label="${escapeHtml(c().aria.world)}" data-skywell-world>
    <path class="chapter-sky chapter-sky-one" d="M0 0h800v760H0z"/>
    <path class="chapter-sky chapter-sky-two" d="M0 210 130 166l126 45 134-32 148 48 122-32 140 44v194H0Z"/>
    <g class="skywell-landmark" role="img" aria-label="${escapeHtml(c().aria.target)}">
      ${skyWedges(progress)}
      <circle class="skywell-aperture" cx="400" cy="210" r="${aperture}"/>
      <circle class="skywell-outer-ring" cx="400" cy="210" r="158"/>
      ${ribMarkup(progress, phase)}
    </g>
    <g class="skywell-support" role="img" aria-label="${escapeHtml(c().aria.support)}">
      <path class="skywell-support-underlay" d="M400 590C382 510 428 420 400 270"/>
      <path class="skywell-support-line" d="M400 590C382 510 428 420 400 270"/>
      <path class="skywell-brace" d="M350 504h100M366 430h68M382 356h36"/>
      <path class="skywell-energy-trace" d="M400 590C382 510 428 420 400 270" pathLength="100"/>
      <circle class="skywell-signal-pulse" cx="400" cy="570" r="11" data-skywell-pulse/>
    </g>
    <path class="far-ridge" d="M0 474 158 407l132 34 118-54 176 76 216-35v332H0Z"/>
    <g class="completed-loombridge" aria-hidden="true">
      <path class="chapter-bridge-cord" d="M66 602Q232 690 401 559"/>
      <path class="chapter-bridge-cord" d="M70 632Q235 716 410 588"/>
      ${Array.from({ length: 12 }, (_, index) => {
        const x = 96 + index * 25;
        const y = 614 + Math.round(Math.sin((index / 11) * Math.PI) * 46) - index * 6;
        return `<path class="chapter-bridge-slat" d="M${x} ${y}l23-3 4 11-23 4Z"/>`;
      }).join('')}
    </g>
    <g class="signal-grove" aria-hidden="true">${lanternMarkup()}</g>
    <path class="chapter-mist" d="M0 584q145-38 298 2t286-2q104-30 216 8v168H0Z"/>
    <path class="near-shore" d="M0 646 160 612l126 38 126-20 118 37 128-23 142 36 100-15v95H0Z"/>
    <g class="skywell-resonators" aria-hidden="true">
      <path class="resonator-line" d="M130 708H670"/>
      <path class="resonator-notch" d="M246 692h24v32h-24zM388 692h24v32h-24zM530 692h24v32h-24z"/>
    </g>
  </svg>`;
}
function progressMarkup(progress) {
  return `<div class="skywell-progress" role="progressbar" aria-label="${escapeHtml(c().aria.progress)}" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${progress}">
    <strong><bdi>${escapeHtml(interpolate(c().world.progress, { current: progress }))}</bdi></strong>
    <span>${escapeHtml(c().world.goal)}</span>
  </div>`;
}
function phaseActions() {
  if (runtime.phase === 'owner') {
    return `<div class="skywell-actions"><p class="skywell-hint">${escapeHtml(c().launch.preview)}</p><button class="chapter-primary" type="button" data-skywell-share>${escapeHtml(c().launch.share)}</button><p class="chapter-status" aria-live="polite" data-skywell-status></p></div>`;
  }
  if (runtime.phase === 'ready') {
    return `<div class="skywell-actions"><p class="skywell-hint">${escapeHtml(c().world.hint)}</p><button class="chapter-primary" type="button" data-start-skywell>${escapeHtml(c().world.action)}</button><p class="chapter-status" aria-live="polite" data-skywell-status></p></div>`;
  }
  if (runtime.phase === 'active') {
    return `<div class="skywell-active" aria-label="${escapeHtml(c().aria.contribution)}"><strong>${escapeHtml(c().active.status)}</strong><span data-skywell-counter>${escapeHtml(interpolate(c().active.counter, { current: 1 }))}</span><button class="chapter-primary" type="button" data-tune-skywell>${escapeHtml(c().active.tune)}</button></div>`;
  }
  if (runtime.phase === 'failed') {
    return `<div class="skywell-result"><h2>${escapeHtml(c().result.failed)}</h2><button class="chapter-primary" type="button" data-skywell-retry>${escapeHtml(c().result.retry)}</button><p class="chapter-status" aria-live="polite" data-skywell-status></p></div>`;
  }
  if (runtime.phase === 'storage-error') {
    return `<div class="skywell-result"><h2>${escapeHtml(c().result.storage)}</h2><button class="chapter-primary" type="button" data-skywell-retry>${escapeHtml(c().result.retry)}</button><p class="chapter-status" aria-live="polite" data-skywell-status></p></div>`;
  }
  if (runtime.phase === 'stale') {
    const href = buildLivingWorldSkywellUrl(runtime.event, { progress: runtime.progress, baseUrl: location.href });
    return `<div class="skywell-result"><h2>${escapeHtml(c().result.stale)}</h2><a class="chapter-primary" href="${escapeHtml(href)}">${escapeHtml(c().result.openCurrent)}</a></div>`;
  }
  if (runtime.phase === 'impact') {
    return `<div class="skywell-impact" aria-live="polite">${escapeHtml(c().result.changed)}</div>`;
  }
  if (runtime.phase === 'result' || runtime.phase === 'complete') {
    const complete = runtime.phase === 'complete';
    return `<div class="skywell-result"><h2>${escapeHtml(complete ? c().result.complete : c().result.changed)}</h2><p>${escapeHtml(complete ? c().result.completeImpact : c().result.impact)}</p><button class="chapter-primary" type="button" data-skywell-share>${escapeHtml(complete ? c().result.shareComplete : c().result.share)}</button><p class="chapter-status" aria-live="polite" data-skywell-status></p></div>`;
  }
  return '';
}
function renderSkywell() {
  revokeShareUrl();
  app.innerHTML = `<main class="living-world-skywell" data-living-skywell data-route="skywell" data-phase="${escapeHtml(runtime.phase)}" data-notch-active="false" data-window-index="0">
    ${creatorStrip()}
    <section class="skywell-stage" aria-labelledby="skywell-title">
      ${worldScene(runtime.progress, runtime.phase)}
      <div class="skywell-title-block ${runtime.phase === 'active' ? 'is-receded' : ''}"><h1 id="skywell-title">${escapeHtml(c().world.title)}</h1>${progressMarkup(runtime.progress)}</div>
      ${phaseActions()}
    </section>
    <div class="skywell-live" aria-live="polite" aria-atomic="true" data-skywell-announcement></div>
  </main>`;
  bindControls();
  installTestControl();
}
function renderLoading() {
  app.innerHTML = `<main class="living-world-skywell" data-living-skywell data-route="loading" data-phase="loading">${creatorStrip()}<section class="skywell-stage"><svg class="skywell-world" viewBox="0 0 800 760" aria-hidden="true"><path class="chapter-sky chapter-sky-one" d="M0 0h800v760H0z"/><path class="far-ridge" d="M0 474 158 407l132 34 118-54 176 76 216-35v332H0Z"/></svg><div class="skywell-result"><h1>${escapeHtml(c().world.loading)}</h1></div></section></main>`;
  bindUtilityControls();
}
function renderRecovery() {
  runtime = null;
  app.innerHTML = `<main class="living-world-skywell" data-living-skywell data-route="recovery" data-phase="unavailable">${creatorStrip()}<section class="skywell-stage" aria-labelledby="skywell-recovery-title"><svg class="skywell-world" viewBox="0 0 800 760" aria-hidden="true"><path class="chapter-sky chapter-sky-one" d="M0 0h800v760H0z"/><path class="far-ridge" d="M0 474 158 407l132 34 118-54 176 76 216-35v332H0Z"/></svg><div class="skywell-result"><h1 id="skywell-recovery-title">${escapeHtml(c().result.unavailable)}</h1><a class="chapter-primary" href="/">${escapeHtml(c().result.recovery)}</a></div></section></main>`;
  bindUtilityControls();
}
function announce(message) {
  const region = document.querySelector('[data-skywell-announcement]');
  if (region) region.textContent = message;
}
function bindUtilityControls() {
  document.querySelectorAll('[data-skywell-locale]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.skywellLocale === getLocale()) return;
    setLocale(button.dataset.skywellLocale);
    syncLocale();
    if (runtime) renderSkywell();
    else mountSkywellRoute();
  }));
  document.querySelector('[data-skywell-sound]')?.addEventListener('click', () => {
    if (!soundSupported()) return;
    safeStorage(() => localStorage.setItem(LIVING_WORLD_SOUND_KEY, soundEnabled() ? 'off' : 'on'));
    if (runtime) renderSkywell();
  });
}
function installTestControl() {
  if (!globalThis[TEST_FLAG]) return;
  globalThis[TEST_CONTROL] = Object.freeze({
    start() {
      if (runtime?.phase !== 'ready') return false;
      startContribution();
      return true;
    },
    setWindow(index, progress) {
      if (runtime?.phase !== 'active' || !Number.isInteger(index) || index < 0 || index > 2) return false;
      const value = Number(progress);
      if (!Number.isFinite(value) || value < 0 || value > 1) return false;
      runtime.windowIndex = index;
      runtime.windowProgress = value;
      while (runtime.lockResults.length < index) runtime.lockResults.push(false);
      const activeNotch = value >= 0.42 && value <= 0.58 && runtime.lockResults.length === index;
      const root = document.querySelector('[data-living-skywell]');
      const pulse = document.querySelector('[data-skywell-pulse]');
      const counter = document.querySelector('[data-skywell-counter]');
      if (root) { root.dataset.notchActive = String(activeNotch); root.dataset.windowIndex = String(index); }
      if (pulse) pulse.setAttribute('cy', String(570 - value * 300));
      if (counter) counter.textContent = interpolate(c().active.counter, { current: index + 1 });
      return true;
    },
    tune() {
      if (runtime?.phase !== 'active') return false;
      tuneContribution();
      return true;
    },
    finish() {
      if (runtime?.phase !== 'active') return false;
      finishContribution();
      return true;
    },
    state() {
      return runtime ? Object.freeze({
        phase: runtime.phase,
        progress: runtime.progress,
        acceptedIndex: runtime.acceptedIndex,
        lockResults: [...runtime.lockResults],
      }) : Object.freeze({ phase: 'idle' });
    },
  });
}
function bindControls() {
  bindUtilityControls();
  document.querySelector('[data-start-skywell]')?.addEventListener('click', startContribution);
  document.querySelector('[data-tune-skywell]')?.addEventListener('click', tuneContribution);
  document.querySelector('[data-skywell-world]')?.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest?.('button, a')) return;
    if (runtime?.phase === 'ready') startContribution();
    else if (runtime?.phase === 'active') tuneContribution();
  });
  document.querySelector('[data-skywell-retry]')?.addEventListener('click', () => {
    runtime.phase = 'ready';
    runtime.lockResults = [];
    renderSkywell();
  });
  document.querySelector('[data-skywell-share]')?.addEventListener('click', shareSkywell);
}
function windowDuration() {
  const override = Number(globalThis[TEST_WINDOW_MS]);
  return Number.isFinite(override) && override >= 120 ? override : 4000;
}
function startContribution() {
  if (!runtime || runtime.phase !== 'ready') return;
  clearTimers();
  runtime.phase = 'active';
  runtime.lockResults = [];
  runtime.windowIndex = 0;
  runtime.windowProgress = 0;
  runtime.windowStart = performance.now();
  renderSkywell();
  announce(c().active.started);
  playCue('start');
  if (!globalThis[TEST_FLAG]) frame = requestAnimationFrame(updateContribution);
}
function updateContribution(now) {
  if (!runtime || runtime.phase !== 'active') return;
  const duration = windowDuration();
  const elapsed = Math.max(0, now - runtime.windowStart);
  const index = Math.min(3, Math.floor(elapsed / duration));
  while (runtime.lockResults.length < Math.min(index, 3)) runtime.lockResults.push(false);
  if (index >= 3) { finishContribution(); return; }
  runtime.windowIndex = index;
  runtime.windowProgress = Math.max(0, Math.min(1, (elapsed - index * duration) / duration));
  const activeNotch = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58 && runtime.lockResults.length === index;
  const root = document.querySelector('[data-living-skywell]');
  const pulse = document.querySelector('[data-skywell-pulse]');
  const counter = document.querySelector('[data-skywell-counter]');
  if (root) {
    root.dataset.notchActive = String(activeNotch);
    root.dataset.windowIndex = String(index);
  }
  if (pulse) pulse.setAttribute('cy', String(570 - runtime.windowProgress * 300));
  if (counter) counter.textContent = interpolate(c().active.counter, { current: index + 1 });
  if (!globalThis[TEST_FLAG]) frame = requestAnimationFrame(updateContribution);
}
function tuneContribution() {
  if (!runtime || runtime.phase !== 'active') return;
  const index = runtime.windowIndex;
  if (runtime.lockResults.length !== index) return;
  const success = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58;
  runtime.lockResults.push(success);
  playCue(success ? 'pass' : 'miss');
  announce(interpolate(success ? c().active.aligned : c().active.missed, { count: index + 1 }));
  const root = document.querySelector('[data-living-skywell]');
  if (root) root.dataset.notchActive = 'false';
}
function finishContribution() {
  clearTimers();
  while (runtime.lockResults.length < 3) runtime.lockResults.push(false);
  if (!evaluateLivingWorldSkywellLocks(runtime.lockResults).accepted) {
    runtime.phase = 'failed';
    renderSkywell();
    announce(c().result.failed);
    return;
  }
  const committed = commitLivingWorldSkywellContribution(localStorage, runtime.event);
  if (committed.status !== 'accepted') {
    runtime.progress = committed.progress ?? runtime.progress;
    runtime.phase = committed.status === 'stale' ? 'stale' : 'storage-error';
    renderSkywell();
    announce(runtime.phase === 'stale' ? c().result.stale : c().result.storage);
    return;
  }
  runtime.acceptedIndex = committed.activatedIndex;
  runtime.progress = committed.progress;
  runtime.phase = 'impact';
  renderSkywell();
  playCue(committed.completed ? 'complete' : 'rib');
  announce(c().result.changed);
  const override = Number(globalThis[TEST_IMPACT_MS]);
  const authored = committed.completed ? 900 : 520;
  const delay = Number.isFinite(override) && override >= 40 ? override : (reducedMotion() ? 80 : authored);
  impactTimer = setTimeout(() => {
    runtime.phase = committed.completed ? 'complete' : 'result';
    renderSkywell();
    announce(committed.completed ? c().result.complete : c().result.changed);
  }, delay);
}

async function shareSkywell(event) {
  const action = event.currentTarget;
  const status = document.querySelector('[data-skywell-status]');
  action.disabled = true;
  if (status) status.textContent = c().world.loading;
  const sharedEvent = { ...runtime.event, progress: runtime.progress };
  const url = buildLivingWorldSkywellUrl(sharedEvent, { progress: runtime.progress, baseUrl: location.href });
  try {
    const model = createLivingWorldSkywellMediaModel(runtime.event, runtime.progress, getLocale());
    const rendered = await renderLivingWorldSkywellMedia(model);
    const file = new File([rendered.blob], LIVING_WORLD_SKYWELL_MEDIA_FILENAME, { type: rendered.blob.type });
    const payload = createLivingWorldSkywellSharePayload(model, url);
    if (supportsLivingWorldSkywellFileShare(navigator, file)) {
      await navigator.share({ ...payload, files: [file] });
      if (status) status.textContent = c().share.shared;
    } else {
      openSharePreview(model, rendered.blob, url, action);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (status) status.textContent = c().share.cancelled;
    } else if (status) status.textContent = c().share.failed;
  } finally {
    action.disabled = false;
  }
}
function openSharePreview(model, blob, url, returnFocus) {
  document.querySelector('[data-skywell-share-dialog]')?.remove();
  revokeShareUrl();
  shareObjectUrl = URL.createObjectURL(blob);
  const dialog = document.createElement('div');
  dialog.className = 'chapter-share-dialog';
  dialog.dataset.skywellShareDialog = 'true';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'skywell-share-title');
  dialog.innerHTML = `<div class="chapter-share-panel">
    <button class="chapter-share-close" type="button" data-skywell-share-close aria-label="${escapeHtml(c().share.close)}">×</button>
    <h2 id="skywell-share-title">${escapeHtml(c().share.preview)}</h2>
    <img src="${escapeHtml(shareObjectUrl)}" alt="${escapeHtml(model.alternative)}" width="270" height="480"/>
    <div class="chapter-share-actions">
      <a class="chapter-primary" href="${escapeHtml(shareObjectUrl)}" download="${LIVING_WORLD_SKYWELL_MEDIA_FILENAME}" data-skywell-save>${escapeHtml(c().share.save)}</a>
      <button class="chapter-secondary" type="button" data-skywell-copy>${escapeHtml(c().share.copy)}</button>
    </div>
    <p class="chapter-status" aria-live="polite" data-skywell-share-status></p>
  </div>`;
  document.body.append(dialog);
  const close = () => {
    dialog.remove();
    revokeShareUrl();
    returnFocus?.focus?.({ preventScroll: true });
  };
  dialog.querySelector('[data-skywell-share-close]')?.addEventListener('click', close);
  dialog.querySelector('[data-skywell-save]')?.addEventListener('click', () => {
    const message = dialog.querySelector('[data-skywell-share-status]');
    if (message) message.textContent = c().share.saved;
  });
  dialog.querySelector('[data-skywell-copy]')?.addEventListener('click', async () => {
    const message = dialog.querySelector('[data-skywell-share-status]');
    try {
      await navigator.clipboard.writeText(url);
      if (message) message.textContent = c().share.copied;
    } catch {
      if (message) message.textContent = c().share.failed;
    }
  });
  dialog.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') close(); });
  dialog.querySelector('[data-skywell-share-close]')?.focus();
}

function eligibleCompletedGrove() {
  const route = chapterFromLocation(location.hash);
  if (route.status !== 'ready') return null;
  const chapter = { ...route.chapter, progress: 8 };
  if (!isLivingWorldSkywellLaunchEligible(localStorage, sessionStorage, chapter)) return null;
  const state = readLivingWorldChapterState(localStorage, chapter);
  const owner = safeStorage(() => sessionStorage.getItem(LIVING_WORLD_CHAPTER_OWNER_KEY) === chapter.chapterId, false);
  const root = document.querySelector('[data-living-chapter][data-route="chapter"][data-phase="complete"]');
  if (!root || !owner || state.status === 'storage-error' || state.progress !== 8) return null;
  return chapter;
}
function installLaunchPreview(root) {
  const world = root.querySelector('[data-chapter-world-scene]');
  if (!world || world.querySelector('[data-skywell-launch-preview]')) return;
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'skywell-launch-preview');
  group.setAttribute('data-skywell-launch-preview', 'true');
  group.setAttribute('aria-hidden', 'true');
  group.innerHTML = `<path class="skywell-preview-support" d="M522 336C500 280 478 214 482 142"/><circle class="skywell-preview-aperture" cx="482" cy="116" r="22"/><path class="skywell-preview-ring" d="M406 116a76 76 0 1 0 152 0a76 76 0 1 0-152 0"/><path class="skywell-preview-ribs" d="M460 126 420 158M452 116h-54M460 104 420 73M504 104 544 73M512 116h54M504 126 544 158"/>`;
  world.append(group);
}
function injectSkywellLaunch() {
  if (location.hash.startsWith('#skywell')) return;
  const chapter = eligibleCompletedGrove();
  if (!chapter) return;
  const root = document.querySelector('[data-living-chapter][data-route="chapter"][data-phase="complete"]');
  const actions = root?.querySelector('.chapter-actions');
  if (!root || !actions || actions.querySelector('[data-launch-skywell]')) return;
  installLaunchPreview(root);
  actions.querySelectorAll('[data-chapter-share], [data-chapter-view]').forEach(control => { control.hidden = true; });
  const cluster = document.createElement('div');
  cluster.className = 'skywell-launch-cluster';
  cluster.innerHTML = `<span>${escapeHtml(c().launch.context)}</span><strong>${escapeHtml(c().launch.title)}</strong><small>${escapeHtml(c().launch.preview)}</small><button class="chapter-primary" type="button" data-launch-skywell aria-label="${escapeHtml(c().aria.launch)}">${escapeHtml(c().launch.action)}</button><p class="chapter-status" aria-live="polite" data-skywell-launch-status></p>`;
  actions.append(cluster);
  cluster.querySelector('[data-launch-skywell]')?.addEventListener('click', event => launchSkywell(chapter, event.currentTarget));
}
function launchSkywell(chapter, action) {
  const status = document.querySelector('[data-skywell-launch-status]');
  action.disabled = true;
  if (status) status.textContent = c().launch.launching;
  const result = createOrResumeLivingWorldSkywell(localStorage, sessionStorage, chapter);
  if (!['created', 'resumed'].includes(result.status)) {
    action.disabled = false;
    if (status) status.textContent = c().launch.failed;
    return;
  }
  safeStorage(() => sessionStorage.setItem(LIVING_WORLD_SKYWELL_OWNER_KEY, result.event.eventId));
  location.hash = buildLivingWorldSkywellUrl(result.event, { baseUrl: location.href }).split('#')[1];
}

function cacheAndCleanRoute(event) {
  safeStorage(() => sessionStorage.setItem(LIVING_WORLD_SKYWELL_ROUTE_KEY, encodeLivingWorldSkywell(event)));
  const safeUrl = `${location.pathname}${location.search}${LIVING_WORLD_SKYWELL_SAFE_FRAGMENT}`;
  history.replaceState(history.state, '', safeUrl);
}
function eventFromSafeRoute() {
  const token = safeStorage(() => sessionStorage.getItem(LIVING_WORLD_SKYWELL_ROUTE_KEY), null);
  if (!token) return null;
  try { return decodeLivingWorldSkywell(token); } catch { return null; }
}
function initializeSkywell(event) {
  clearTimers();
  const resolved = resolveLivingWorldSkywell(localStorage, event);
  if (['invalid', 'expired', 'ahead'].includes(resolved.status)) {
    renderRecovery();
    return;
  }
  const owner = safeStorage(() => sessionStorage.getItem(LIVING_WORLD_SKYWELL_OWNER_KEY) === event.eventId, false);
  runtime = {
    event: resolved.event,
    progress: resolved.progress,
    owner,
    phase: owner && resolved.status === 'ready' ? 'owner'
      : resolved.status === 'stale' ? 'stale'
        : resolved.status === 'storage-error' ? 'storage-error'
          : resolved.status === 'completed' || resolved.progress >= LIVING_WORLD_SKYWELL_TARGET ? 'complete'
            : 'ready',
    lockResults: [],
    windowIndex: 0,
    windowProgress: 0,
    acceptedIndex: null,
  };
  renderSkywell();
  if (runtime.phase === 'ready') announce(c().world.goal);
}
function mountSkywellRoute() {
  syncLocale();
  const raw = skywellFromLocation(location.hash);
  if (raw.status === 'ready') {
    renderLoading();
    cacheAndCleanRoute(raw.event);
    initializeSkywell(raw.event);
    return;
  }
  if (raw.status === 'invalid' || raw.status === 'expired') {
    clearTimers();
    revokeShareUrl();
    renderRecovery();
    return;
  }
  if (location.hash === LIVING_WORLD_SKYWELL_SAFE_FRAGMENT) {
    const event = eventFromSafeRoute();
    if (event) initializeSkywell(event);
    else renderRecovery();
    return;
  }
  clearTimers();
  revokeShareUrl();
  runtime = null;
  queueMicrotask(injectSkywellLaunch);
}
function queueInjection() {
  if (observerQueued) return;
  observerQueued = true;
  queueMicrotask(() => {
    observerQueued = false;
    injectSkywellLaunch();
  });
}

if (app) {
  const observer = new MutationObserver(queueInjection);
  observer.observe(app, { childList: true, subtree: true });
  window.addEventListener('hashchange', mountSkywellRoute);
  document.addEventListener('keydown', event => {
    if (!runtime || event.repeat || ![' ', 'Enter'].includes(event.key)) return;
    if (event.target.closest?.('button, a, input, select, textarea')) return;
    event.preventDefault();
    if (runtime.phase === 'ready') startContribution();
    else if (runtime.phase === 'active') tuneContribution();
  });
  window.addEventListener('beforeunload', () => {
    clearTimers();
    revokeShareUrl();
  });
  mountSkywellRoute();
}
