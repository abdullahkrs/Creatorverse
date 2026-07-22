import { getLocale, setLocale } from './i18n.js';
import {
  buildLivingWorldUrl,
  commitLivingWorldContribution,
  createLivingWorldEvent,
  deriveLoombridgeSlats,
  evaluateThreadLocks,
  eventFromLocation,
  LIVING_WORLD_SOUND_KEY,
  readLivingWorldState,
} from './living-world-event.js';
import { formatLivingWorldCopy, getLivingWorldCopy } from './living-world-i18n.js';

const LAUNCH_HASH = '#living-world-launch';
const OWNER_KEY = 'creatorverse-living-world-owner-v1';
const TEST_WINDOW_MS = '__CREATORVERSE_LIVING_WORLD_WINDOW_MS__';
const TEST_IMPACT_MS = '__CREATORVERSE_LIVING_WORLD_IMPACT_MS__';
const app = document.querySelector('#app');

let launchDuration = '6h';
let launchTarget = 24;
let runtime = null;
let animationFrame = 0;
let impactTimer = 0;
let observerQueued = false;
let audioContext = null;

function copy() { return getLivingWorldCopy(getLocale()); }
function isArabic() { return getLocale() === 'ar'; }
function safeStorage(action, fallback = null) {
  try { return action(); } catch { return fallback; }
}
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
  return formatLivingWorldCopy(template, Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === 'number' ? localizedNumber(value) : value]),
  ));
}
function syncDocumentLocale() {
  document.documentElement.lang = getLocale();
  document.documentElement.dir = isArabic() ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isArabic());
}
function clearTimers() {
  cancelAnimationFrame(animationFrame);
  clearTimeout(impactTimer);
  animationFrame = 0;
  impactTimer = 0;
}
function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function soundSupported() {
  return Boolean(globalThis.AudioContext || globalThis.webkitAudioContext);
}
function soundEnabled() {
  return soundSupported() && safeStorage(() => localStorage.getItem(LIVING_WORLD_SOUND_KEY) === 'on', false);
}
function getAudioContext() {
  if (!soundSupported()) return null;
  if (!audioContext) {
    const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    audioContext = new Constructor();
  }
  return audioContext;
}
function playCue(type) {
  if (!soundEnabled()) return;
  const context = getAudioContext();
  if (!context) return;
  context.resume?.();
  const patterns = {
    ambient: [[174, 0, 0.32, 0.025]],
    lock: [[392, 0, 0.07, 0.045]],
    miss: [[164, 0, 0.06, 0.025]],
    impact: [[261, 0, 0.12, 0.04], [329, 0.1, 0.18, 0.035]],
    complete: [[294, 0, 0.12, 0.04], [392, 0.11, 0.12, 0.04], [220, 0.23, 0.28, 0.045]],
  };
  const now = context.currentTime;
  for (const [frequency, delay, duration, gainValue] of patterns[type] || []) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(gainValue, now + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + duration + 0.02);
  }
}
function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

function emblem() {
  return `
    <svg class="living-world-emblem" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(copy().aria.emblem)}">
      <path d="M5 24V9l5-4v15m17 4V9l-5-4v15M10 12h12M10 17h12M10 22h12"/>
    </svg>`;
}

function worldScene(progress, target, phase = 'ready') {
  const activeSlats = deriveLoombridgeSlats(progress, target);
  const complete = progress >= target;
  const slats = Array.from({ length: 12 }, (_, index) => {
    const x = 248 + index * 25;
    const y = 269 - Math.round(Math.abs(5.5 - index) * 2.1);
    return `<path class="loom-slat ${index < activeSlats ? 'is-woven' : ''}" d="M${x} ${y}l22-2 4 9-22 2Z"/>`;
  }).join('');
  return `
    <svg class="folded-horizon ${complete ? 'is-complete' : ''} ${phase === 'impact' ? 'is-impacting' : ''}" viewBox="0 0 800 520" role="img" aria-label="${escapeHtml(copy().aria.world)}" data-world-scene>
      <path class="sky-fold sky-fold-one" d="M0 0h800v182L650 150 520 176 392 132 258 174 122 144 0 170Z"/>
      <path class="sky-fold sky-fold-two" d="M0 122 126 96l126 42 136-30 146 46 122-32 144 44v98H0Z"/>
      <path class="far-terrace" d="M0 230 130 201l112 34 134-44 120 36 126-31 178 42v132H0Z"/>
      <path class="far-shutter far-shutter-start" d="M510 204 650 180l52 42-52 118-138 20Z"/>
      <path class="far-shutter far-shutter-end" d="M650 180 800 218v132l-150-10 52-118Z"/>
      <g class="far-awakening" aria-hidden="true">
        <path d="M592 252h18v28h-18zM629 238h16v24h-16zM676 258h20v30h-20z"/>
        <path class="far-plants" d="M566 330q14-38 28 0 12-48 25 0 14-34 28 0 12-46 26 0 14-38 30 0"/>
      </g>
      <path class="mist-channel" d="M0 302q150-42 298 2t286-2q104-34 216 8v122H0Z"/>
      <path class="near-terrace" d="M0 354 160 320l118 40 128-22 120 44 126-28 148 42 100-18v142H0Z"/>
      <g class="loom-tower tower-start" aria-hidden="true">
        <path d="M173 172h58l14 190h-86Z"/><path d="M181 191h42v28h-42zM187 244h31v72h-31z"/>
      </g>
      <g class="loom-tower tower-end" aria-hidden="true">
        <path d="M569 172h58l14 190h-86Z"/><path d="M577 191h42v28h-42zM582 244h31v72h-31z"/>
      </g>
      <path class="bridge-cord" d="M220 234Q400 300 580 234"/>
      <path class="bridge-cord" d="M220 278Q400 330 580 278"/>
      <g class="loom-slats" role="img" aria-label="${escapeHtml(copy().aria.bridge)}">${slats}</g>
      <path class="energy-seam" d="M400 476C390 424 345 390 372 344S398 316 400 286"/>
      <g class="contribution-loom ${phase === 'active' ? 'is-active' : ''}" data-contribution-loom aria-hidden="true">
        <path class="loom-window" d="M112 420H688"/>
        <path class="loom-notch" d="M388 402h24v40h-24z"/>
        <circle class="loom-shuttle" cx="130" cy="421" r="13" data-living-world-shuttle/>
      </g>
    </svg>`;
}

function utilityControls({ compact = false } = {}) {
  const c = copy();
  const supported = soundSupported();
  const enabled = soundEnabled();
  return `
    <div class="living-world-utilities ${compact ? 'is-compact' : ''}" aria-label="${escapeHtml(c.aria.utility)}">
      <div class="living-world-language" aria-label="${escapeHtml(c.world.language)}">
        <button type="button" data-living-locale="en" aria-pressed="${getLocale() === 'en'}" aria-label="${escapeHtml(c.world.english)}">EN</button>
        <button type="button" data-living-locale="ar" aria-pressed="${getLocale() === 'ar'}" aria-label="${escapeHtml(c.world.arabic)}">ع</button>
      </div>
      <button class="living-world-sound" type="button" data-living-sound aria-pressed="${enabled}" ${supported ? '' : 'disabled'} aria-label="${escapeHtml(supported ? (enabled ? c.world.soundOn : c.world.soundOff) : c.world.soundUnavailable)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6L9 10H5Zm12-1q2 3 0 6"/></svg>
      </button>
    </div>`;
}

function creatorStrip() {
  const c = copy();
  return `
    <header class="living-world-creator-strip">
      <div class="living-world-creator">${emblem()}<span>${escapeHtml(c.creator.realm)}</span><small>${escapeHtml(c.creator.live)}</small></div>
      ${utilityControls({ compact: true })}
    </header>`;
}

function progressMarkup(progress, target) {
  const remaining = Math.max(0, target - progress);
  return `
    <div class="living-world-progress" role="progressbar" aria-label="${escapeHtml(copy().aria.progress)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${progress}">
      <strong><bdi>${localizedNumber(progress)} / ${localizedNumber(target)}</bdi></strong>
      <span>${escapeHtml(interpolate(copy().world.goal, { count: remaining }))}</span>
    </div>`;
}

function renderLaunch() {
  const c = copy();
  app.innerHTML = `
    <main class="living-world living-world-launch" data-living-world data-route="launch">
      ${creatorStrip()}
      <section class="living-world-stage" aria-labelledby="living-launch-title">
        ${worldScene(4, launchTarget, 'preview')}
        <div class="living-world-title-block">
          <p>${escapeHtml(c.launch.eyebrow)}</p>
          <h1 id="living-launch-title">${escapeHtml(c.launch.title)}</h1>
        </div>
        <form class="living-world-launch-controls" data-living-launch-form>
          <fieldset>
            <legend>${escapeHtml(c.launch.duration)}</legend>
            <div class="living-world-segments">
              <button type="button" data-launch-duration="6h" aria-pressed="${launchDuration === '6h'}">${escapeHtml(c.launch.sixHours)}</button>
              <button type="button" data-launch-duration="24h" aria-pressed="${launchDuration === '24h'}">${escapeHtml(c.launch.day)}</button>
            </div>
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(c.launch.target)}</legend>
            <div class="living-world-segments">
              ${[12, 24, 48].map(target => `<button type="button" data-launch-target="${target}" aria-pressed="${launchTarget === target}"><bdi>${localizedNumber(target)}</bdi></button>`).join('')}
            </div>
          </fieldset>
          <button class="living-world-primary" type="submit" data-living-launch>${escapeHtml(c.launch.launch)}</button>
          <p class="living-world-action-status" aria-live="polite" data-living-status></p>
        </form>
      </section>
    </main>`;
  bindSharedControls();
  document.querySelector('[data-living-launch-form]')?.addEventListener('submit', launchEvent);
  document.querySelectorAll('[data-launch-duration]').forEach(button => button.addEventListener('click', () => {
    launchDuration = button.dataset.launchDuration;
    renderLaunch();
  }));
  document.querySelectorAll('[data-launch-target]').forEach(button => button.addEventListener('click', () => {
    launchTarget = Number(button.dataset.launchTarget);
    renderLaunch();
  }));
}

function renderRecovery(status) {
  const c = copy();
  app.innerHTML = `
    <main class="living-world living-world-recovery" data-living-world data-route="recovery" data-state="${escapeHtml(status)}">
      ${creatorStrip()}
      <section class="living-world-stage" aria-labelledby="living-recovery-title">
        ${worldScene(0, 24, 'unavailable')}
        <div class="living-world-result-copy">
          <h1 id="living-recovery-title">${escapeHtml(c.recovery.unavailable)}</h1>
          <a class="living-world-primary" href="/">${escapeHtml(c.recovery.return)}</a>
        </div>
      </section>
    </main>`;
  bindSharedControls();
}

function ownerActions() {
  const c = copy();
  return `
    <div class="living-world-actions">
      <button class="living-world-primary" type="button" data-living-share>${escapeHtml(c.launch.share)}</button>
      <button class="living-world-secondary" type="button" data-view-follower>${escapeHtml(c.launch.view)}</button>
      <p class="living-world-action-status" aria-live="polite" data-living-status></p>
    </div>`;
}

function phaseCopy() {
  const c = copy();
  if (runtime.phase === 'failed') return { title: c.result.failed, primary: c.result.retry, action: 'retry' };
  if (runtime.phase === 'duplicate') return { title: c.result.duplicate, primary: c.result.view, action: 'view' };
  if (runtime.phase === 'storage-error') return { title: c.result.settledError, primary: c.result.tryAgain, action: 'retry' };
  if (runtime.phase === 'complete') return { title: c.result.complete, impact: c.result.completeImpact, primary: c.result.shareOpening, action: 'share' };
  if (runtime.phase === 'result') return { title: c.result.reached, impact: c.result.impact, primary: c.result.share, action: 'share' };
  return null;
}

function renderEvent() {
  const c = copy();
  const event = runtime.event;
  const owner = runtime.owner;
  const phase = runtime.phase;
  const result = phaseCopy();
  const remaining = Math.max(0, event.target - runtime.progress);
  const shareTitle = runtime.progress >= event.target ? c.share.completeTitle : c.share.partialTitle;
  const shareDetail = runtime.progress >= event.target ? '' : interpolate(c.share.partialDetail, { count: remaining });
  const shareCall = runtime.progress >= event.target ? c.share.completeCall : c.share.partialCall;

  app.innerHTML = `
    <main class="living-world living-world-event" data-living-world data-route="event" data-phase="${escapeHtml(phase)}" data-notch-active="false" data-window-index="0">
      ${creatorStrip()}
      <section class="living-world-stage ${result ? 'has-result' : ''}" aria-labelledby="living-world-title" data-share-composition aria-label="${escapeHtml(c.aria.shareComposition)}">
        ${worldScene(runtime.progress, event.target, phase)}
        <div class="living-world-title-block ${phase === 'active' ? 'is-receded' : ''}">
          <h1 id="living-world-title">${escapeHtml(c.world.title)}</h1>
          ${progressMarkup(runtime.progress, event.target)}
        </div>
        ${owner ? ownerActions() : ''}
        ${!owner && phase === 'ready' ? `
          <div class="living-world-actions">
            <p class="living-world-hint">${escapeHtml(c.world.hint)}</p>
            <button class="living-world-primary" type="button" data-start-thread>${escapeHtml(c.world.send)}</button>
            <p class="living-world-action-status" aria-live="polite" data-living-status></p>
          </div>` : ''}
        ${!owner && phase === 'active' ? `
          <div class="living-world-active" aria-label="${escapeHtml(c.aria.contribution)}">
            <strong>${escapeHtml(c.active.status)}</strong>
            <span data-attempt-counter>${escapeHtml(interpolate(c.active.counter, { current: 1 }))}</span>
            <button class="living-world-primary living-world-lock" type="button" data-living-world-lock>${escapeHtml(c.active.lock)}</button>
          </div>` : ''}
        ${!owner && phase === 'impact' ? `<div class="living-world-impact-label" aria-live="polite">${escapeHtml(c.result.progressChanged)}</div>` : ''}
        ${!owner && result ? `
          <div class="living-world-result-copy">
            <h2>${escapeHtml(result.title)}</h2>
            ${result.impact ? `<p>${escapeHtml(result.impact)}</p>` : ''}
            <button class="living-world-primary" type="button" data-result-action="${result.action}">${escapeHtml(result.primary)}</button>
            <p class="living-world-action-status" aria-live="polite" data-living-status></p>
          </div>
          ${(phase === 'result' || phase === 'complete') ? `
            <div class="living-world-share-copy">
              <strong>${escapeHtml(shareTitle)}</strong>
              ${shareDetail ? `<span>${escapeHtml(shareDetail)}</span>` : ''}
              <small>${escapeHtml(shareCall)}</small>
            </div>` : ''}` : ''}
      </section>
      <div class="living-world-live-region" aria-live="polite" aria-atomic="true" data-living-announcement></div>
    </main>`;

  bindSharedControls();
  document.querySelector('[data-start-thread]')?.addEventListener('click', startThread);
  document.querySelector('[data-living-world-lock]')?.addEventListener('click', lockCurrentWindow);
  document.querySelector('[data-world-scene]')?.addEventListener('pointerdown', eventObject => {
    if (runtime?.phase === 'active' && !eventObject.target.closest('button')) lockCurrentWindow();
  });
  document.querySelector('[data-living-share]')?.addEventListener('click', shareEvent);
  document.querySelector('[data-view-follower]')?.addEventListener('click', () => {
    safeStorage(() => sessionStorage.removeItem(OWNER_KEY));
    runtime.owner = false;
    runtime.phase = runtime.progress >= event.target ? 'complete' : 'ready';
    renderEvent();
  });
  document.querySelector('[data-result-action="share"]')?.addEventListener('click', shareEvent);
  document.querySelector('[data-result-action="retry"]')?.addEventListener('click', () => {
    runtime.phase = 'ready';
    runtime.lockResults = [];
    renderEvent();
  });
  document.querySelector('[data-result-action="view"]')?.addEventListener('click', () => {
    runtime.phase = runtime.progress >= event.target ? 'complete' : 'ready';
    renderEvent();
  });
}

function announce(message) {
  const region = document.querySelector('[data-living-announcement]');
  if (region) region.textContent = message;
}

function bindSharedControls() {
  document.querySelectorAll('[data-living-locale]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.livingLocale === getLocale()) return;
    setLocale(button.dataset.livingLocale);
    syncDocumentLocale();
    if (location.hash === LAUNCH_HASH) renderLaunch();
    else if (runtime?.event) renderEvent();
    else renderRecovery('invalid');
  }));
  document.querySelector('[data-living-sound]')?.addEventListener('click', () => {
    if (!soundSupported()) return;
    const enable = !soundEnabled();
    safeStorage(() => localStorage.setItem(LIVING_WORLD_SOUND_KEY, enable ? 'on' : 'off'));
    if (enable) playCue('ambient');
    if (location.hash === LAUNCH_HASH) renderLaunch();
    else if (runtime?.event) renderEvent();
  });
}

function launchEvent(eventObject) {
  eventObject.preventDefault();
  const action = document.querySelector('[data-living-launch]');
  const status = document.querySelector('[data-living-status]');
  if (action) action.disabled = true;
  if (status) status.textContent = copy().launch.launching;
  try {
    const event = createLivingWorldEvent({ duration: launchDuration, target: launchTarget });
    safeStorage(() => sessionStorage.setItem(OWNER_KEY, event.eventId));
    location.hash = buildLivingWorldUrl(event, { baseUrl: location.href }).split('#')[1];
  } catch {
    if (action) action.disabled = false;
    if (status) status.textContent = copy().result.settledError;
  }
}

function startThread() {
  clearTimers();
  runtime.phase = 'active';
  runtime.lockResults = [];
  runtime.windowIndex = 0;
  runtime.windowStart = performance.now();
  runtime.lockedWindow = -1;
  renderEvent();
  announce(copy().active.started);
  playCue('ambient');
  animationFrame = requestAnimationFrame(updateThread);
}

function windowDuration() {
  const override = Number(globalThis[TEST_WINDOW_MS]);
  return Number.isFinite(override) && override >= 120 ? override : 4000;
}

function updateThread(now) {
  if (!runtime || runtime.phase !== 'active') return;
  const duration = windowDuration();
  const elapsed = Math.max(0, now - runtime.windowStart);
  const index = Math.min(3, Math.floor(elapsed / duration));

  while (runtime.lockResults.length < Math.min(index, 3)) runtime.lockResults.push(false);
  if (index >= 3) {
    finishThread();
    return;
  }

  runtime.windowIndex = index;
  const progress = (elapsed - index * duration) / duration;
  runtime.windowProgress = Math.max(0, Math.min(1, progress));
  const active = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58 && runtime.lockResults.length === index;
  const root = document.querySelector('[data-living-world]');
  const shuttle = document.querySelector('[data-living-world-shuttle]');
  const counter = document.querySelector('[data-attempt-counter]');
  if (root) {
    root.dataset.notchActive = String(active);
    root.dataset.windowIndex = String(index);
  }
  if (shuttle) shuttle.setAttribute('cx', String(130 + runtime.windowProgress * 540));
  if (counter) counter.textContent = interpolate(copy().active.counter, { current: index + 1 });
  animationFrame = requestAnimationFrame(updateThread);
}

function lockCurrentWindow() {
  if (!runtime || runtime.phase !== 'active') return;
  const index = runtime.windowIndex;
  if (runtime.lockResults.length !== index) return;
  const success = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58;
  runtime.lockResults.push(success);
  playCue(success ? 'lock' : 'miss');
  vibrate(success ? 18 : 8);
  announce(interpolate(success ? copy().active.locked : copy().active.missed, { count: index + 1 }));
  const root = document.querySelector('[data-living-world]');
  if (root) root.dataset.notchActive = 'false';
}

function finishThread() {
  clearTimers();
  while (runtime.lockResults.length < 3) runtime.lockResults.push(false);
  const result = evaluateThreadLocks(runtime.lockResults);
  if (!result.accepted) {
    runtime.phase = 'failed';
    renderEvent();
    announce(copy().result.failed);
    return;
  }
  const committed = commitLivingWorldContribution(localStorage, runtime.event);
  if (committed.status === 'storage-error') {
    runtime.phase = 'storage-error';
    renderEvent();
    announce(copy().result.settledError);
    return;
  }
  if (committed.status === 'duplicate') {
    runtime.progress = committed.progress;
    runtime.phase = 'duplicate';
    renderEvent();
    announce(copy().result.duplicate);
    return;
  }
  runtime.progress = committed.progress;
  runtime.phase = 'impact';
  renderEvent();
  playCue(committed.completed ? 'complete' : 'impact');
  vibrate(committed.completed ? [20, 35, 30] : 24);
  announce(copy().result.progressChanged);
  const override = Number(globalThis[TEST_IMPACT_MS]);
  const delay = Number.isFinite(override) && override >= 40 ? override : (reducedMotion() ? 120 : 900);
  impactTimer = setTimeout(() => {
    runtime.phase = committed.completed ? 'complete' : 'result';
    renderEvent();
    announce(committed.completed ? copy().result.complete : copy().result.reached);
  }, delay);
}

async function shareEvent() {
  if (!runtime?.event) return;
  const action = document.querySelector('[data-living-share], [data-result-action="share"]');
  const status = document.querySelector('[data-living-status]');
  if (action) action.disabled = true;
  const c = copy();
  const url = buildLivingWorldUrl(runtime.event, { progress: runtime.progress, baseUrl: location.href });
  const completed = runtime.progress >= runtime.event.target;
  const title = completed ? c.share.completeTitle : c.share.partialTitle;
  const text = completed ? c.share.completeCall : interpolate(c.share.partialDetail, { count: runtime.event.target - runtime.progress });
  try {
    if (navigator.share) await navigator.share({ title, text, url });
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else throw new Error('SHARE_UNAVAILABLE');
    if (status) status.textContent = navigator.share ? c.launch.shared : c.share.copied;
  } catch (error) {
    if (error?.name !== 'AbortError' && status) status.textContent = c.share.failed;
  } finally {
    if (action) action.disabled = false;
    action?.focus({ preventScroll: true });
  }
}

function initializeEvent(route) {
  clearTimers();
  const stored = readLivingWorldState(localStorage, route.event);
  const owner = safeStorage(() => sessionStorage.getItem(OWNER_KEY) === route.event.eventId, false);
  runtime = {
    event: route.event,
    progress: stored.progress,
    owner,
    phase: owner ? (stored.progress >= route.event.target ? 'complete' : 'ready')
      : stored.status === 'storage-error' ? 'storage-error'
        : stored.status === 'duplicate' ? 'duplicate'
          : stored.progress >= route.event.target ? 'complete' : 'ready',
    lockResults: [],
    windowIndex: 0,
    windowProgress: 0,
  };
  renderEvent();
}

function mountRoute() {
  syncDocumentLocale();
  const route = eventFromLocation(location.hash);
  if (route.status === 'ready') initializeEvent(route);
  else if (location.hash === LAUNCH_HASH) {
    clearTimers();
    runtime = null;
    renderLaunch();
  } else if (route.status === 'invalid' || route.status === 'expired') {
    clearTimers();
    runtime = null;
    renderRecovery(route.status);
  } else {
    clearTimers();
    runtime = null;
    ensureLegacyLauncher();
  }
}

function ensureLegacyLauncher() {
  if (location.hash === LAUNCH_HASH || location.hash.startsWith('#world-event=')) return;
  const host = document.querySelector('.nav-actions');
  if (!host || host.querySelector('[data-open-living-world]')) return;
  const link = document.createElement('a');
  link.className = 'secondary living-world-entry-link';
  link.dataset.openLivingWorld = 'true';
  link.href = LAUNCH_HASH;
  link.textContent = isArabic() ? 'حدث حي' : 'Live event';
  host.prepend(link);
}

function queueLegacyLauncher() {
  if (observerQueued) return;
  observerQueued = true;
  queueMicrotask(() => {
    observerQueued = false;
    if (!location.hash || (!location.hash.startsWith('#world-event=') && location.hash !== LAUNCH_HASH)) ensureLegacyLauncher();
  });
}

const legacyObserver = new MutationObserver(queueLegacyLauncher);
if (app) legacyObserver.observe(app, { childList: true, subtree: true });
window.addEventListener('hashchange', mountRoute);
document.addEventListener('keydown', event => {
  if (!runtime || runtime.phase !== 'active' || event.repeat || ![' ', 'Enter'].includes(event.key)) return;
  if (event.target.closest?.('[data-living-world-lock]')) return;
  event.preventDefault();
  lockCurrentWindow();
});

mountRoute();
