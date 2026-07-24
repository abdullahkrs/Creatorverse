import { getLocale, setLocale } from './i18n.js';
import {
  chapterFromLocation,
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  readLivingWorldChapterState,
} from './living-world-chapter.js';
import { LIVING_WORLD_SOUND_KEY } from './living-world-event.js';
import {
  buildLivingWorldSkywellUrl,
  commitLivingWorldSkywellContribution,
  createOrResumeLivingWorldSkywell,
  decodeLivingWorldSkywell,
  deriveSkywellRibs,
  evaluateSkywellLocks,
  LIVING_WORLD_SKYWELL_FRAGMENT,
  LIVING_WORLD_SKYWELL_HISTORY_KEY,
  LIVING_WORLD_SKYWELL_OWNER_KEY,
  readLivingWorldSkywellState,
  skywellFromLocation,
} from './living-world-skywell.js';
import { formatLivingWorldSkywellCopy, getLivingWorldSkywellCopy } from './living-world-skywell-i18n.js';
import {
  createLivingWorldSkywellMediaModel,
  createLivingWorldSkywellSharePayload,
  LIVING_WORLD_SKYWELL_MEDIA_FILENAME,
  renderLivingWorldSkywellMedia,
  supportsLivingWorldSkywellFileShare,
} from './living-world-skywell-media.js';

const TEST_WINDOW_MS = '__CREATORVERSE_SKYWELL_WINDOW_MS__';
const TEST_IMPACT_MS = '__CREATORVERSE_SKYWELL_IMPACT_MS__';
const CLEAN_HASH = '#skywell';
const app = document.querySelector('#app');

let runtime = null;
let frame = 0;
let impactTimer = 0;
let audioContext = null;
let shareObjectUrl = '';
let observerQueued = false;
let mountSequence = 0;

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
function clearRuntimeTimers() {
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
function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
function soundSupported() { return Boolean(globalThis.AudioContext || globalThis.webkitAudioContext); }
function soundEnabled() {
  return soundSupported() && safeStorage(() => localStorage.getItem(LIVING_WORLD_SOUND_KEY) === 'on', false);
}
function playCue(type) {
  if (!soundEnabled()) return;
  const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!audioContext) audioContext = new Constructor();
  audioContext.resume?.();
  const patterns = {
    start: [[220, 0, 0.12, 0.028]],
    pass: [[330, 0, 0.07, 0.03]],
    miss: [[145, 0, 0.06, 0.022]],
    rib: [[294, 0, 0.11, 0.035], [392, 0.1, 0.16, 0.03]],
    complete: [[294, 0, 0.12, 0.035], [392, 0.12, 0.18, 0.035], [523, 0.3, 0.68, 0.025]],
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
}
function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch {} }

function emblem() {
  return `<svg class="skywell-emblem" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(c().aria.emblem)}"><path d="M6 25V10l5-4v14m15 5V10l-5-4v14M11 12h10M11 17h10M11 22h10"/><path d="M9 7q7-6 14 0"/></svg>`;
}
function utilities() {
  const copy = c();
  const supported = soundSupported();
  const enabled = soundEnabled();
  return `<div class="skywell-utilities" aria-label="${escapeHtml(copy.aria.utility)}">
    <div class="skywell-language" aria-label="${escapeHtml(copy.world.language)}">
      <button type="button" data-skywell-locale="en" aria-pressed="${getLocale() === 'en'}" aria-label="${escapeHtml(copy.world.english)}">EN</button>
      <button type="button" data-skywell-locale="ar" aria-pressed="${getLocale() === 'ar'}" aria-label="${escapeHtml(copy.world.arabic)}">ع</button>
    </div>
    <button class="skywell-sound" type="button" data-skywell-sound aria-pressed="${enabled}" ${supported ? '' : 'disabled'} aria-label="${escapeHtml(supported ? (enabled ? copy.world.soundOn : copy.world.soundOff) : copy.world.soundUnavailable)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6L9 10H5Zm12-1q2 3 0 6"/></svg>
    </button>
  </div>`;
}
function creatorStrip() {
  return `<header class="skywell-creator-strip">
    <div class="skywell-creator">${emblem()}<span>${escapeHtml(c().creator.realm)}</span><small>${escapeHtml(c().creator.live)}</small></div>
    ${utilities()}
  </header>`;
}

const RIB_ANGLES = [-148, -116, -80, -44, -12, 24];
function point(angle, radius) {
  const radians = angle * Math.PI / 180;
  return [400 + Math.cos(radians) * radius, 190 + Math.sin(radians) * radius];
}
function ribMarkup(progress) {
  return deriveSkywellRibs(progress).map(({ index, open, target, dormant }) => {
    const angle = RIB_ANGLES[index];
    const length = open ? 148 : 84;
    const [endX, endY] = point(angle, length);
    const [braceX, braceY] = point(angle + 90, 8);
    const [braceX2, braceY2] = point(angle - 90, 8);
    const [wedgeOneX, wedgeOneY] = point(angle - 18, 124);
    const [wedgeTwoX, wedgeTwoY] = point(angle + 18, 124);
    const state = open ? 'is-open' : target ? 'is-target' : dormant ? 'is-dormant' : 'is-closed';
    return `<g class="skywell-rib ${state}" data-skywell-rib="${index}">
      ${open ? `<path class="skywell-sky-wedge" d="M400 190L${wedgeOneX.toFixed(1)} ${wedgeOneY.toFixed(1)}L${wedgeTwoX.toFixed(1)} ${wedgeTwoY.toFixed(1)}Z"/>` : ''}
      <path class="skywell-rib-edge" d="M${braceX.toFixed(1)} ${braceY.toFixed(1)}L${endX.toFixed(1)} ${endY.toFixed(1)}L${braceX2.toFixed(1)} ${braceY2.toFixed(1)}"/>
      <path class="skywell-rib-cable" d="M400 190L${endX.toFixed(1)} ${endY.toFixed(1)}"/>
      <circle class="skywell-hinge" cx="400" cy="190" r="${target ? 13 : 10}"/>
      ${target ? `<path class="skywell-feeder" d="M400 505C400 410 400 320 400 205"/>` : ''}
    </g>`;
  }).join('');
}
function groveLanternMarkup() {
  return Array.from({ length: 8 }, (_, index) => {
    const x = 225 + index * 47;
    const y = 505 - Math.round(Math.sin((index / 7) * Math.PI) * 44) - index * 2;
    return `<g class="skywell-history-lantern" transform="translate(${x} ${y})"><path d="M0 74 7 22 17 74Z"/><circle cx="8" cy="20" r="7"/><path class="skywell-history-thread" d="M8 72 39 79"/></g>`;
  }).join('');
}
function worldScene(progress, phase = 'ready') {
  const complete = progress >= 6;
  return `<svg class="skywell-world ${complete ? 'is-complete' : ''} ${phase === 'impact' ? 'is-impacting' : ''} ${phase === 'active' ? 'is-active' : ''}" viewBox="0 0 800 700" role="img" aria-label="${escapeHtml(c().aria.world)}" data-skywell-world-scene>
    <path class="skywell-sky-back" d="M0 0h800v310L680 270 560 315 430 255 300 312 158 264 0 306Z"/>
    <path class="skywell-sky-field" d="M0 155 142 105l126 63 144-58 148 62 116-48 124 56v207H0Z"/>
    <g class="skywell-canopy" role="img" aria-label="${escapeHtml(c().aria.skywell)}">
      <circle class="skywell-aperture" cx="400" cy="190" r="128"/>
      ${ribMarkup(progress)}
      <path class="skywell-outer-weave" d="M276 190Q400 45 524 190Q400 335 276 190Z"/>
      ${complete ? '<path class="skywell-light-column" d="M400 193V528"/>' : ''}
    </g>
    <g class="skywell-central-support" aria-hidden="true"><path d="M374 532 392 210h16l18 322Z"/><path d="M362 430h76M369 350h62M378 275h44"/></g>
    <g class="skywell-completed-grove" role="img" aria-label="${escapeHtml(c().aria.grove)}">${groveLanternMarkup()}</g>
    <g class="skywell-completed-bridge" role="img" aria-label="${escapeHtml(c().aria.bridge)}">
      <path class="skywell-bridge-cord" d="M48 590Q195 690 365 530"/><path class="skywell-bridge-cord" d="M54 622Q202 708 372 565"/>
      ${Array.from({ length: 12 }, (_, index) => {
        const x = 77 + index * 24;
        const y = 599 + Math.round(Math.sin((index / 11) * Math.PI) * 46) - index * 5;
        return `<path class="skywell-bridge-slat" d="M${x} ${y}l22-3 4 11-22 4Z"/>`;
      }).join('')}
    </g>
    <path class="skywell-near-ground" d="M0 594 130 560l125 45 120-35 128 51 133-44 164 46v77H0Z"/>
    <path class="skywell-energy-route" d="M252 585C318 550 375 535 400 492V210"/>
    <circle class="skywell-energy-pulse" cx="252" cy="585" r="9" data-skywell-pulse/>
  </svg>`;
}
function progressMarkup(progress) {
  const remaining = Math.max(0, 6 - progress);
  return `<div class="skywell-progress" role="progressbar" aria-label="${escapeHtml(c().aria.progress)}" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${progress}">
    <strong><bdi>${localizedNumber(progress)} / ${localizedNumber(6)}</bdi></strong>
    <span>${escapeHtml(interpolate(c().world.goal, { count: remaining }))}</span>
  </div>`;
}
function phaseCopy() {
  if (runtime.phase === 'failed') return { title: c().result.failed, primary: c().result.retry, action: 'retry' };
  if (runtime.phase === 'duplicate') return { title: c().result.duplicate, primary: c().result.view, action: 'view' };
  if (runtime.phase === 'stale') return { title: c().result.stale, primary: c().result.openCurrent, action: 'current' };
  if (runtime.phase === 'storage-error') return { title: c().result.storageError, primary: c().result.retry, action: 'retry' };
  if (runtime.phase === 'complete') return { title: c().result.complete, impact: c().result.completeImpact, primary: c().result.shareWorld, action: 'share' };
  if (runtime.phase === 'result') return { title: c().result.opened, impact: c().result.impact, primary: c().result.share, action: 'share' };
  return null;
}

function renderSkywell() {
  revokeShareUrl();
  const result = phaseCopy();
  const owner = runtime.owner;
  app.innerHTML = `<main class="living-world-skywell" data-skywell-root data-route="skywell" data-phase="${escapeHtml(runtime.phase)}" data-notch-active="false" data-window-index="0">
    ${creatorStrip()}
    <section class="skywell-stage ${result ? 'has-result' : ''}" aria-labelledby="skywell-title" data-skywell-share-composition>
      ${worldScene(runtime.progress, runtime.phase)}
      <div class="skywell-title-block ${runtime.phase === 'active' ? 'is-receded' : ''}">
        <h1 id="skywell-title">${escapeHtml(c().world.title)}</h1>
        ${progressMarkup(runtime.progress)}
      </div>
      ${owner ? `<div class="skywell-actions">
        <button class="skywell-primary" type="button" data-skywell-share>${escapeHtml(c().launch.share)}</button>
        <button class="skywell-secondary" type="button" data-skywell-view>${escapeHtml(c().launch.view)}</button>
        <p class="skywell-status" aria-live="polite" data-skywell-status></p>
      </div>` : ''}
      ${!owner && runtime.phase === 'ready' ? `<div class="skywell-actions">
        <p class="skywell-hint">${escapeHtml(c().world.hint)}</p>
        <button class="skywell-primary" type="button" data-skywell-start>${escapeHtml(c().world.send)}</button>
        <p class="skywell-status" aria-live="polite" data-skywell-status></p>
      </div>` : ''}
      ${!owner && runtime.phase === 'active' ? `<div class="skywell-active" aria-label="${escapeHtml(c().aria.contribution)}">
        <strong>${escapeHtml(c().active.status)}</strong>
        <span data-skywell-counter>${escapeHtml(interpolate(c().active.counter, { current: 1 }))}</span>
        <button class="skywell-primary" type="button" data-skywell-align>${escapeHtml(c().active.tune)}</button>
      </div>` : ''}
      ${!owner && runtime.phase === 'impact' ? `<div class="skywell-impact-label" aria-live="polite">${escapeHtml(c().result.progressChanged)}</div>` : ''}
      ${!owner && result ? `<div class="skywell-result-copy">
        <h2>${escapeHtml(result.title)}</h2>
        ${result.impact ? `<p>${escapeHtml(result.impact)}</p>` : ''}
        <button class="skywell-primary" type="button" data-skywell-result="${result.action}">${escapeHtml(result.primary)}</button>
        <p class="skywell-status" aria-live="polite" data-skywell-status></p>
      </div>` : ''}
    </section>
    <div class="skywell-live" aria-live="polite" aria-atomic="true" data-skywell-announcement></div>
  </main>`;
  bindSkywellControls();
}
function renderLoading() {
  app.innerHTML = `<main class="living-world-skywell" data-skywell-root data-route="loading" data-phase="loading">${creatorStrip()}<section class="skywell-stage" aria-labelledby="skywell-loading-title">${worldScene(0, 'loading')}<div class="skywell-result-copy"><h1 id="skywell-loading-title">${escapeHtml(c().world.loading)}</h1></div></section></main>`;
  bindUtilityControls();
}
function renderRecovery(state) {
  runtime = null;
  app.innerHTML = `<main class="living-world-skywell skywell-recovery" data-skywell-root data-route="recovery" data-state="${escapeHtml(state)}">${creatorStrip()}<section class="skywell-stage" aria-labelledby="skywell-recovery-title">${worldScene(0, 'unavailable')}<div class="skywell-result-copy"><h1 id="skywell-recovery-title">${escapeHtml(c().recovery.unavailable)}</h1><a class="skywell-primary" href="/">${escapeHtml(c().recovery.return)}</a></div></section></main>`;
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
    const next = !soundEnabled();
    safeStorage(() => localStorage.setItem(LIVING_WORLD_SOUND_KEY, next ? 'on' : 'off'));
    if (runtime) renderSkywell();
  });
}
function bindSkywellControls() {
  bindUtilityControls();
  document.querySelector('[data-skywell-start]')?.addEventListener('click', startContribution);
  document.querySelector('[data-skywell-align]')?.addEventListener('click', alignSignal);
  document.querySelector('[data-skywell-world-scene]')?.addEventListener('pointerdown', event => {
    if (runtime?.phase === 'active' && !event.target.closest('button')) {
      event.preventDefault();
      event.stopPropagation();
      alignSignal();
    }
  });
  document.querySelector('[data-skywell-share]')?.addEventListener('click', shareSkywell);
  document.querySelector('[data-skywell-view]')?.addEventListener('click', () => {
    safeStorage(() => sessionStorage.removeItem(LIVING_WORLD_SKYWELL_OWNER_KEY));
    runtime.owner = false;
    runtime.phase = runtime.progress >= 6 ? 'complete' : 'ready';
    renderSkywell();
  });
  document.querySelector('[data-skywell-result="share"]')?.addEventListener('click', shareSkywell);
  document.querySelector('[data-skywell-result="retry"]')?.addEventListener('click', () => {
    runtime.phase = 'ready';
    runtime.lockResults = [];
    renderSkywell();
  });
  document.querySelector('[data-skywell-result="view"]')?.addEventListener('click', () => {
    runtime.phase = runtime.progress >= 6 ? 'complete' : 'duplicate';
    renderSkywell();
  });
  document.querySelector('[data-skywell-result="current"]')?.addEventListener('click', () => {
    runtime.phase = runtime.progress >= 6 ? 'complete' : 'duplicate';
    renderSkywell();
  });
}

function startContribution() {
  clearRuntimeTimers();
  runtime.phase = 'active';
  runtime.lockResults = [];
  runtime.windowIndex = 0;
  runtime.windowProgress = 0;
  runtime.windowStart = performance.now();
  renderSkywell();
  playCue('start');
  announce(c().active.started);
  frame = requestAnimationFrame(updateContribution);
}
function signalWindowDuration() {
  const override = Number(globalThis[TEST_WINDOW_MS]);
  return Number.isFinite(override) && override >= 120 ? override : 4000;
}
function updateContribution(now) {
  if (!runtime || runtime.phase !== 'active') return;
  const duration = signalWindowDuration();
  const elapsed = Math.max(0, now - runtime.windowStart);
  const index = Math.min(3, Math.floor(elapsed / duration));
  while (runtime.lockResults.length < Math.min(index, 3)) runtime.lockResults.push(false);
  if (index >= 3) { finishContribution(); return; }
  runtime.windowIndex = index;
  runtime.windowProgress = Math.max(0, Math.min(1, (elapsed - index * duration) / duration));
  const active = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58 && runtime.lockResults.length === index;
  const root = document.querySelector('[data-skywell-root]');
  const pulse = document.querySelector('[data-skywell-pulse]');
  const counter = document.querySelector('[data-skywell-counter]');
  if (root) {
    root.dataset.notchActive = String(active);
    root.dataset.windowIndex = String(index);
  }
  if (pulse) {
    const t = runtime.windowProgress;
    const x = 252 + (400 - 252) * Math.min(1, t * 1.35);
    const y = t < 0.74 ? 585 + (492 - 585) * (t / 0.74) : 492 + (210 - 492) * ((t - 0.74) / 0.26);
    pulse.setAttribute('cx', String(x));
    pulse.setAttribute('cy', String(y));
  }
  if (counter) counter.textContent = interpolate(c().active.counter, { current: index + 1 });
  frame = requestAnimationFrame(updateContribution);
}
function alignSignal() {
  if (!runtime || runtime.phase !== 'active') return;
  const index = runtime.windowIndex;
  if (runtime.lockResults.length !== index) return;
  const success = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58;
  runtime.lockResults.push(success);
  playCue(success ? 'pass' : 'miss');
  vibrate(success ? 16 : 7);
  announce(interpolate(success ? c().active.locked : c().active.missed, { count: index + 1 }));
  const root = document.querySelector('[data-skywell-root]');
  if (root) root.dataset.notchActive = 'false';
}
function finishContribution() {
  clearRuntimeTimers();
  while (runtime.lockResults.length < 3) runtime.lockResults.push(false);
  const result = evaluateSkywellLocks(runtime.lockResults);
  if (!result.accepted) {
    runtime.phase = 'failed';
    renderSkywell();
    announce(c().result.failed);
    return;
  }
  const committed = commitLivingWorldSkywellContribution(localStorage, runtime.skywell);
  if (committed.status === 'storage-error') {
    runtime.phase = 'storage-error';
    renderSkywell();
    announce(c().result.storageError);
    return;
  }
  if (committed.status === 'duplicate' || committed.status === 'stale') {
    runtime.progress = committed.progress;
    runtime.phase = committed.status === 'stale' ? 'stale' : 'duplicate';
    renderSkywell();
    announce(committed.status === 'stale' ? c().result.stale : c().result.duplicate);
    return;
  }
  runtime.progress = committed.progress;
  runtime.phase = 'impact';
  renderSkywell();
  playCue(committed.completed ? 'complete' : 'rib');
  vibrate(committed.completed ? [18, 30, 24] : [16, 22, 16]);
  announce(c().result.progressChanged);
  const override = Number(globalThis[TEST_IMPACT_MS]);
  const delay = Number.isFinite(override) && override >= 40 ? override : (reducedMotion() ? 80 : (committed.completed ? 900 : 520));
  impactTimer = setTimeout(() => {
    runtime.phase = committed.completed ? 'complete' : 'result';
    renderSkywell();
    announce(committed.completed ? c().result.complete : c().result.opened);
  }, delay);
}

async function shareSkywell() {
  if (!runtime?.skywell) return;
  const action = document.querySelector('[data-skywell-share], [data-skywell-result="share"]');
  const status = document.querySelector('[data-skywell-status]');
  if (action) action.disabled = true;
  if (status) status.textContent = c().world.loading;
  const skywellUrl = buildLivingWorldSkywellUrl(runtime.skywell, { progress: runtime.progress, baseUrl: location.href });
  try {
    const model = createLivingWorldSkywellMediaModel(runtime.skywell, runtime.progress, getLocale());
    const rendered = await renderLivingWorldSkywellMedia(model);
    const file = new File([rendered.blob], LIVING_WORLD_SKYWELL_MEDIA_FILENAME, { type: rendered.blob.type });
    const payload = createLivingWorldSkywellSharePayload(model, skywellUrl);
    if (supportsLivingWorldSkywellFileShare(navigator, file)) {
      await navigator.share({ ...payload, files: [file] });
      if (status) status.textContent = c().launch.shared;
    } else {
      openSharePreview(model, rendered.blob, skywellUrl, action);
    }
  } catch (error) {
    if (error?.name !== 'AbortError' && status) status.textContent = c().share.failed;
  } finally {
    if (action) action.disabled = false;
  }
}
function openSharePreview(model, blob, url, returnFocus) {
  revokeShareUrl();
  shareObjectUrl = URL.createObjectURL(blob);
  const dialog = document.createElement('div');
  dialog.className = 'skywell-share-dialog';
  dialog.dataset.skywellShareDialog = 'true';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'skywell-share-title');
  dialog.innerHTML = `<div class="skywell-share-panel">
    <button class="skywell-share-close" type="button" data-skywell-share-close aria-label="${escapeHtml(c().share.close)}">×</button>
    <h2 id="skywell-share-title">${escapeHtml(c().share.preview)}</h2>
    <img src="${escapeHtml(shareObjectUrl)}" alt="${escapeHtml(model.alternative)}" width="270" height="480"/>
    <div class="skywell-share-actions">
      <a class="skywell-primary" href="${escapeHtml(shareObjectUrl)}" download="${LIVING_WORLD_SKYWELL_MEDIA_FILENAME}" data-skywell-save>${escapeHtml(c().share.save)}</a>
      <button class="skywell-secondary" type="button" data-skywell-copy>${escapeHtml(c().share.copy)}</button>
    </div>
    <p class="skywell-status" aria-live="polite" data-skywell-share-status></p>
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
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  dialog.querySelector('[data-skywell-share-close]')?.focus();
}

function eligibleCompletedChapter() {
  const route = chapterFromLocation(location.hash);
  if (route.status !== 'ready' || route.chapter.progress !== 8) return null;
  const owner = safeStorage(() => sessionStorage.getItem(LIVING_WORLD_CHAPTER_OWNER_KEY) === route.chapter.chapterId, false);
  const state = readLivingWorldChapterState(localStorage, route.chapter);
  if (!owner || state.status === 'storage-error' || state.progress !== 8) return null;
  const root = document.querySelector('[data-living-chapter][data-route="chapter"][data-phase="complete"]');
  if (!root) return null;
  return { ...route.chapter, progress: 8 };
}
function injectSkywellLaunch() {
  if (location.hash.startsWith(`#${LIVING_WORLD_SKYWELL_FRAGMENT}=`) || location.hash === CLEAN_HASH) return;
  const predecessor = eligibleCompletedChapter();
  if (!predecessor) return;
  const actions = document.querySelector('[data-living-chapter][data-route="chapter"] .chapter-actions');
  if (!actions || actions.querySelector('[data-skywell-launch-cluster]')) return;
  const cluster = document.createElement('section');
  cluster.className = 'skywell-launch-cluster';
  cluster.dataset.skywellLaunchCluster = 'true';
  cluster.setAttribute('aria-labelledby', 'skywell-launch-title');
  cluster.innerHTML = `<span>${escapeHtml(c().launch.context)}</span><h2 id="skywell-launch-title">${escapeHtml(c().launch.title)}</h2><p>${escapeHtml(c().launch.preview)}</p><button class="chapter-primary" type="button" data-launch-skywell>${escapeHtml(c().launch.action)}</button><p class="chapter-status" aria-live="polite" data-skywell-launch-status></p>`;
  actions.append(cluster);
  cluster.querySelector('[data-launch-skywell]')?.addEventListener('click', () => launchSkywell(predecessor, cluster));
}
function launchSkywell(predecessor, cluster) {
  const action = cluster.querySelector('[data-launch-skywell]');
  const status = cluster.querySelector('[data-skywell-launch-status]');
  if (action) action.disabled = true;
  if (status) status.textContent = c().launch.launching;
  const result = createOrResumeLivingWorldSkywell(localStorage, predecessor);
  if (!['created', 'resumed'].includes(result.status)) {
    if (action) action.disabled = false;
    if (status) status.textContent = c().launch.failed;
    return;
  }
  safeStorage(() => sessionStorage.setItem(LIVING_WORLD_SKYWELL_OWNER_KEY, result.skywell.skywellId));
  const target = buildLivingWorldSkywellUrl(result.skywell, { baseUrl: location.href });
  location.hash = target.split('#')[1];
}

function rawTokenFromLocation() {
  const prefix = `#${LIVING_WORLD_SKYWELL_FRAGMENT}=`;
  if (location.hash.startsWith(prefix)) return location.hash.slice(prefix.length);
  if (location.hash === CLEAN_HASH) {
    const token = history.state?.[LIVING_WORLD_SKYWELL_HISTORY_KEY];
    return typeof token === 'string' ? token : '';
  }
  return '';
}
function cleanVisibleTransport(token) {
  const nextState = { ...(history.state || {}), [LIVING_WORLD_SKYWELL_HISTORY_KEY]: token };
  history.replaceState(nextState, '', `${location.pathname}${location.search}${CLEAN_HASH}`);
}
function initializeSkywell(skywell) {
  clearRuntimeTimers();
  const state = readLivingWorldSkywellState(localStorage, skywell);
  const owner = safeStorage(() => sessionStorage.getItem(LIVING_WORLD_SKYWELL_OWNER_KEY) === skywell.skywellId, false);
  runtime = {
    skywell,
    progress: state.progress,
    owner,
    phase: owner ? (state.progress >= 6 ? 'complete' : 'owner')
      : state.status === 'storage-error' ? 'storage-error'
        : state.status === 'stale' ? 'stale'
          : state.status === 'duplicate' ? 'duplicate'
            : state.progress >= 6 ? 'complete' : 'ready',
    lockResults: [],
    windowIndex: 0,
    windowProgress: 0,
  };
  renderSkywell();
}
function mountSkywellRoute() {
  syncLocale();
  const token = rawTokenFromLocation();
  if (!token) {
    clearRuntimeTimers();
    revokeShareUrl();
    runtime = null;
    queueMicrotask(injectSkywellLaunch);
    return;
  }
  let route;
  if (location.hash.startsWith(`#${LIVING_WORLD_SKYWELL_FRAGMENT}=`)) route = skywellFromLocation(location.hash);
  else {
    try { route = { status: 'ready', skywell: decodeLivingWorldSkywell(token) }; }
    catch (error) { route = { status: error.message === 'SKYWELL_EXPIRED' ? 'expired' : 'invalid' }; }
  }
  if (route.status === 'ready') {
    if (location.hash !== CLEAN_HASH) cleanVisibleTransport(token);
    const sequence = ++mountSequence;
    renderLoading();
    queueMicrotask(() => { if (sequence === mountSequence) initializeSkywell(route.skywell); });
  } else if (route.status === 'invalid' || route.status === 'expired') {
    clearRuntimeTimers();
    revokeShareUrl();
    renderRecovery(route.status);
  }
}
function queueInjection() {
  if (observerQueued || runtime) return;
  observerQueued = true;
  queueMicrotask(() => {
    observerQueued = false;
    injectSkywellLaunch();
  });
}

const observer = new MutationObserver(queueInjection);
if (app) observer.observe(app, { childList: true, subtree: true });
window.addEventListener('hashchange', mountSkywellRoute);
window.addEventListener('popstate', mountSkywellRoute);
document.addEventListener('keydown', event => {
  if (!runtime || runtime.phase !== 'active' || event.repeat || ![' ', 'Enter'].includes(event.key)) return;
  if (event.target.closest?.('[data-skywell-align]')) return;
  event.preventDefault();
  alignSignal();
});
window.addEventListener('beforeunload', revokeShareUrl);

mountSkywellRoute();
