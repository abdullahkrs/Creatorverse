import { getLocale, setLocale } from './i18n.js';
import { LIVING_WORLD_SOUND_KEY } from './living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  chapterFromLocation,
  readLivingWorldChapterState,
} from './living-world-chapter.js';
import {
  createLivingWorldChapterMediaModel,
  createLivingWorldChapterSharePayload,
  LIVING_WORLD_CHAPTER_MEDIA_FILENAME,
  renderLivingWorldChapterMedia,
  supportsLivingWorldChapterFileShare,
} from './living-world-chapter-media.js';
import { getLivingWorldChapterCopy } from './living-world-chapter-i18n.js';
import {
  buildLivingWorldLightRelayUrl,
  commitLivingWorldLightRelayContribution,
  createLivingWorldLightRelay,
  deriveLightRelayLanterns,
  evaluateLightRelayLocks,
  lightRelayFromLocation,
  resolveLivingWorldLightRelay,
} from './living-world-light-relay.js';
import {
  formatLivingWorldLightRelayCopy,
  getLivingWorldLightRelayCopy,
} from './living-world-light-relay-i18n.js';
import {
  createLivingWorldLightRelayMediaModel,
  createLivingWorldLightRelaySharePayload,
  LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME,
  renderLivingWorldLightRelayMedia,
  supportsLivingWorldLightRelayFileShare,
} from './living-world-light-relay-media.js';

const TEST_WINDOW_MS = '__CREATORVERSE_RELAY_WINDOW_MS__';
const TEST_IMPACT_MS = '__CREATORVERSE_RELAY_IMPACT_MS__';
const app = document.querySelector('#app');

let runtime = null;
let frame = 0;
let impactTimer = 0;
let shareObjectUrl = '';
let audioContext = null;

function c() { return getLivingWorldLightRelayCopy(getLocale()); }
function chapterCopy() { return getLivingWorldChapterCopy(getLocale()); }
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
  return formatLivingWorldLightRelayCopy(template, Object.fromEntries(
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
      start: [[196, 0, 0.14, 0.025]],
      pass: [[330, 0, 0.08, 0.03]],
      miss: [[150, 0, 0.08, 0.02]],
      lantern: [[330, 0, 0.1, 0.03], [440, 0.1, 0.15, 0.03]],
      complete: [[294, 0, 0.1, 0.035], [392, 0.1, 0.1, 0.035], [494, 0.2, 0.18, 0.035]],
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
      <button type="button" data-relay-locale="en" aria-pressed="${getLocale() === 'en'}" aria-label="${escapeHtml(c().world.english)}">EN</button>
      <button type="button" data-relay-locale="ar" aria-pressed="${getLocale() === 'ar'}" aria-label="${escapeHtml(c().world.arabic)}">ع</button>
    </div>
    <button class="chapter-sound" type="button" data-relay-sound aria-pressed="${enabled}" ${supported ? '' : 'disabled'} aria-label="${escapeHtml(supported ? (enabled ? c().world.soundOn : c().world.soundOff) : c().world.soundUnavailable)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6L9 10H5Zm12-1q2 3 0 6"/></svg>
    </button>
  </div>`;
}
function creatorStrip() {
  return `<header class="chapter-creator-strip">
    <div class="chapter-creator">${emblem()}<span>${escapeHtml(c().creator.realm)}</span><small>${escapeHtml(c().creator.live)}</small></div>
    ${utilities()}
  </header>`;
}

function lanternCoordinates(index) {
  const x = 430 + index * 37;
  const y = 230 - Math.round(Math.sin((index / 7) * Math.PI) * 56) - index * 4;
  return { x: x + 11, y: y + 34 };
}
function relayPath(startIndex, endIndex, complete = false) {
  const start = startIndex >= 0 ? lanternCoordinates(startIndex) : { x: 522, y: 336 };
  const end = lanternCoordinates(endIndex);
  const stop = complete ? end : {
    x: end.x - (end.x - start.x) * 0.22,
    y: end.y - (end.y - start.y) * 0.22,
  };
  return `M${start.x} ${start.y} C${start.x + 18} ${start.y - 34} ${stop.x - 24} ${stop.y + 28} ${stop.x} ${stop.y}`;
}
function lanternMarkup(progress, phase) {
  const relayPhase = phase === 'impact' ? 'impact' : 'ready';
  const lanterns = deriveLightRelayLanterns(runtime.relay, { progress, phase: relayPhase });
  return lanterns.map(({ index, active, target, connected }) => {
    const x = 430 + index * 37;
    const y = 230 - Math.round(Math.sin((index / 7) * Math.PI) * 56) - index * 4;
    const classes = ['signal-lantern'];
    if (active) classes.push('is-active');
    if (target) classes.push('is-relay-target');
    if (connected) classes.push('is-relay-connected');
    return `<g class="${classes.join(' ')}" data-lantern-index="${index}" ${target ? 'data-light-relay-target="true"' : ''} transform="translate(${x} ${y})">
      <path class="lantern-stem" d="M0 110 9 35 24 110Z"/>
      <path class="lantern-shutter lantern-shutter-start" d="M-15 38 4 15 8 62-11 75Z"/>
      <path class="lantern-shutter lantern-shutter-end" d="M15 14 37 37 30 76 12 62Z"/>
      <circle class="lantern-core" cx="11" cy="34" r="9"/>
      <path class="lantern-path" d="M11 108 48 118"/>
      <path class="lantern-cradle" d="M-4 92h30v18H-4z"/>
      <path class="lantern-detail" d="M-8 126h48m-35 8 9-8 8 8"/>
    </g>`;
  }).join('');
}
function relayStructure(progress, phase) {
  if (progress >= 8 && phase !== 'impact') return '';
  const targetIndex = phase === 'impact' ? runtime.acceptedTarget : progress;
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 1 || targetIndex > 7) return '';
  const complete = phase === 'impact';
  return `<g class="light-relay-structure ${complete ? 'is-connected' : 'is-unfinished'}" data-light-relay-strand="${complete ? 'connected' : 'unfinished'}" aria-hidden="true">
    <path class="light-relay-underlay" d="${relayPath(targetIndex - 1, targetIndex, complete)}" pathLength="100"/>
    <path class="light-relay-strand" d="${relayPath(targetIndex - 1, targetIndex, complete)}" pathLength="100"/>
    ${complete ? '' : `<path class="light-relay-clamp" d="M${lanternCoordinates(targetIndex).x - 16} ${lanternCoordinates(targetIndex).y + 58}h28v18h-28z"/>`}
  </g>`;
}
function worldScene(progress, phase) {
  const complete = progress >= 8;
  return `<svg class="light-relay-world ${complete ? 'is-complete' : ''} ${phase === 'impact' ? 'is-impacting' : ''}" viewBox="0 0 800 560" role="img" aria-label="${escapeHtml(c().aria.world)}" data-light-relay-world>
    <path class="chapter-sky chapter-sky-one" d="M0 0h800v180L654 148 520 178 394 130 258 176 124 144 0 172Z"/>
    <path class="chapter-sky chapter-sky-two" d="M0 126 130 94l126 44 134-31 148 47 122-31 140 43v112H0Z"/>
    <path class="far-ridge" d="M224 292 358 222l132 26 118-70 192 72v192H214Z"/>
    <g class="completed-loombridge" role="img" aria-label="${escapeHtml(chapterCopy().aria.bridge)}">
      <path class="chapter-bridge-cord" d="M86 374Q300 492 522 316"/>
      <path class="chapter-bridge-cord" d="M92 414Q305 522 532 356"/>
      ${Array.from({ length: 12 }, (_, index) => {
        const x = 128 + index * 32;
        const y = 392 + Math.round(Math.sin((index / 11) * Math.PI) * 62) - index * 8;
        return `<path class="chapter-bridge-slat" d="M${x} ${y}l28-4 5 13-28 5Z"/>`;
      }).join('')}
    </g>
    <g class="signal-grove" role="img" aria-label="${escapeHtml(c().aria.world)}">${lanternMarkup(progress, phase)}</g>
    ${relayStructure(progress, phase)}
    <g class="inhabited-field" aria-hidden="true"><path d="M548 346h28v44h-28zM602 326h24v39h-24zM654 348h31v48h-31zM710 316h28v42h-28z"/><path class="field-plants" d="M515 421q17-42 34 0 15-49 31 0 16-38 34 0 16-47 33 0 17-40 36 0"/></g>
    <path class="chapter-mist" d="M0 372q145-45 298 2t286-2q104-35 216 9v116H0Z"/>
    <path class="near-shore" d="M0 430 160 392l126 42 126-22 118 42 128-26 142 40 100-17v109H0Z"/>
    <g class="chapter-resonators ${phase === 'active' ? 'is-active' : ''}" aria-hidden="true">
      <path class="resonator-line" d="M118 490H682"/>
      <path class="resonator-notch" d="M244 474h22v34h-22zM390 474h22v34h-22zM536 474h22v34h-22z"/>
      <circle class="resonator-pulse" cx="128" cy="491" r="12" data-relay-pulse/>
    </g>
  </svg>`;
}
function progressMarkup(progress) {
  return `<div class="light-relay-progress" role="progressbar" aria-label="${escapeHtml(c().aria.progress)}" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${progress}">
    <strong><bdi>${escapeHtml(interpolate(c().world.progress, { current: progress }))}</bdi></strong>
    <span>${escapeHtml(c().world.goal)}</span>
  </div>`;
}
function phaseActions() {
  if (runtime.phase === 'ready') {
    return `<div class="light-relay-actions"><p class="light-relay-hint">${escapeHtml(c().world.hint)}</p><button class="chapter-primary" type="button" data-start-relay>${escapeHtml(c().world.action)}</button><p class="chapter-status" aria-live="polite" data-relay-status></p></div>`;
  }
  if (runtime.phase === 'active') {
    return `<div class="light-relay-active" aria-label="${escapeHtml(c().aria.contribution)}"><strong>${escapeHtml(c().active.status)}</strong><span data-relay-counter>${escapeHtml(interpolate(c().active.counter, { current: 1 }))}</span><button class="chapter-primary" type="button" data-tune-relay>${escapeHtml(c().active.tune)}</button></div>`;
  }
  if (runtime.phase === 'failed') {
    return `<div class="light-relay-result"><h2>${escapeHtml(c().result.failed)}</h2><button class="chapter-primary" type="button" data-relay-retry>${escapeHtml(c().result.retry)}</button><p class="chapter-status" aria-live="polite" data-relay-status></p></div>`;
  }
  if (runtime.phase === 'storage-error') {
    return `<div class="light-relay-result"><h2>${escapeHtml(c().result.storage)}</h2><button class="chapter-primary" type="button" data-relay-retry>${escapeHtml(c().result.retry)}</button><p class="chapter-status" aria-live="polite" data-relay-status></p></div>`;
  }
  if (runtime.phase === 'stale') {
    const href = buildLivingWorldChapterUrl({ ...runtime.chapter, progress: runtime.progress }, { progress: runtime.progress, baseUrl: location.href });
    return `<div class="light-relay-result"><h2>${escapeHtml(c().result.stale)}</h2><a class="chapter-primary" href="${escapeHtml(href)}">${escapeHtml(c().result.openCurrent)}</a></div>`;
  }
  if (runtime.phase === 'impact') {
    return `<div class="light-relay-impact" aria-live="polite">${escapeHtml(c().result.changed)}</div>`;
  }
  if (runtime.phase === 'result' || runtime.phase === 'complete') {
    const complete = runtime.phase === 'complete';
    return `<div class="light-relay-result"><h2>${escapeHtml(complete ? c().result.complete : c().result.arrived)}</h2><p>${escapeHtml(complete ? c().result.completeImpact : c().result.impact)}</p><button class="chapter-primary" type="button" data-light-relay-share>${escapeHtml(complete ? c().result.shareComplete : c().result.share)}</button><p class="chapter-status" aria-live="polite" data-relay-status></p></div>`;
  }
  return '';
}
function renderRelay() {
  revokeShareUrl();
  app.innerHTML = `<main class="living-world-light-relay" data-living-light-relay data-route="relay" data-phase="${escapeHtml(runtime.phase)}" data-notch-active="false" data-window-index="0">
    ${creatorStrip()}
    <section class="light-relay-stage" aria-labelledby="light-relay-title">
      ${worldScene(runtime.progress, runtime.phase)}
      <div class="light-relay-title-block ${runtime.phase === 'active' ? 'is-receded' : ''}"><h1 id="light-relay-title">${escapeHtml(c().world.title)}</h1>${progressMarkup(runtime.progress)}</div>
      ${phaseActions()}
    </section>
    <span class="light-relay-sr-only" data-light-relay-alt>${escapeHtml(c().aria.world)}</span>
    <div class="light-relay-live" aria-live="polite" aria-atomic="true" data-relay-announcement></div>
  </main>`;
  bindControls();
}
function renderRecovery() {
  app.innerHTML = `<main class="living-world-light-relay" data-living-light-relay data-route="recovery" data-phase="unavailable">
    ${creatorStrip()}
    <section class="light-relay-stage" aria-labelledby="light-relay-recovery-title">
      <svg class="light-relay-world" viewBox="0 0 800 560" aria-hidden="true"><path class="chapter-sky chapter-sky-one" d="M0 0h800v560H0z"/><path class="far-ridge" d="M0 300 180 220l170 58 170-80 280 90v272H0z"/><path class="near-shore" d="M0 430 160 392l126 42 126-22 118 42 128-26 142 40 100-17v109H0Z"/></svg>
      <div class="light-relay-result"><h1 id="light-relay-recovery-title">${escapeHtml(c().result.unavailable)}</h1><a class="chapter-primary" href="/">${escapeHtml(c().result.recovery)}</a></div>
    </section>
  </main>`;
  bindUtilityControls();
}
function announce(message) {
  const region = document.querySelector('[data-relay-announcement]');
  if (region) region.textContent = message;
}
function bindUtilityControls() {
  document.querySelectorAll('[data-relay-locale]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.relayLocale === getLocale()) return;
    setLocale(button.dataset.relayLocale);
    syncLocale();
    if (runtime) renderRelay();
    else mountRelayRoute();
  }));
  document.querySelector('[data-relay-sound]')?.addEventListener('click', () => {
    if (!soundSupported()) return;
    safeStorage(() => localStorage.setItem(LIVING_WORLD_SOUND_KEY, soundEnabled() ? 'off' : 'on'));
    if (runtime) renderRelay();
  });
}
function bindControls() {
  bindUtilityControls();
  document.querySelector('[data-start-relay]')?.addEventListener('click', startRelay);
  document.querySelector('[data-tune-relay]')?.addEventListener('click', tuneRelay);
  document.querySelector('[data-light-relay-world]')?.addEventListener('pointerdown', event => {
    if (runtime?.phase === 'active' && !event.target.closest('button')) tuneRelay();
  });
  document.querySelector('[data-relay-retry]')?.addEventListener('click', () => {
    runtime.phase = 'ready';
    runtime.lockResults = [];
    renderRelay();
  });
  document.querySelector('[data-light-relay-share]')?.addEventListener('click', shareRelayResult);
}
function windowDuration() {
  const override = Number(globalThis[TEST_WINDOW_MS]);
  return Number.isFinite(override) && override >= 120 ? override : 4000;
}
function startRelay() {
  clearTimers();
  runtime.phase = 'active';
  runtime.lockResults = [];
  runtime.windowIndex = 0;
  runtime.windowProgress = 0;
  runtime.windowStart = performance.now();
  renderRelay();
  announce(c().active.started);
  playCue('start');
  frame = requestAnimationFrame(updateRelay);
}
function updateRelay(now) {
  if (!runtime || runtime.phase !== 'active') return;
  const duration = windowDuration();
  const elapsed = Math.max(0, now - runtime.windowStart);
  const index = Math.min(3, Math.floor(elapsed / duration));
  while (runtime.lockResults.length < Math.min(index, 3)) runtime.lockResults.push(false);
  if (index >= 3) { finishRelay(); return; }
  runtime.windowIndex = index;
  runtime.windowProgress = Math.max(0, Math.min(1, (elapsed - index * duration) / duration));
  const active = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58 && runtime.lockResults.length === index;
  const root = document.querySelector('[data-living-light-relay]');
  const pulse = document.querySelector('[data-relay-pulse]');
  const counter = document.querySelector('[data-relay-counter]');
  if (root) { root.dataset.notchActive = String(active); root.dataset.windowIndex = String(index); }
  if (pulse) pulse.setAttribute('cx', String(128 + runtime.windowProgress * 544));
  if (counter) counter.textContent = interpolate(c().active.counter, { current: index + 1 });
  frame = requestAnimationFrame(updateRelay);
}
function tuneRelay() {
  if (!runtime || runtime.phase !== 'active') return;
  const index = runtime.windowIndex;
  if (runtime.lockResults.length !== index) return;
  const success = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58;
  runtime.lockResults.push(success);
  playCue(success ? 'pass' : 'miss');
  announce(interpolate(success ? c().active.aligned : c().active.missed, { count: index + 1 }));
  const root = document.querySelector('[data-living-light-relay]');
  if (root) root.dataset.notchActive = 'false';
}
function finishRelay() {
  clearTimers();
  while (runtime.lockResults.length < 3) runtime.lockResults.push(false);
  if (!evaluateLightRelayLocks(runtime.lockResults).accepted) {
    runtime.phase = 'failed';
    renderRelay();
    announce(c().result.failed);
    return;
  }
  const committed = commitLivingWorldLightRelayContribution(localStorage, runtime.relay);
  if (committed.status !== 'accepted') {
    runtime.progress = committed.progress ?? runtime.progress;
    runtime.phase = committed.status === 'stale' ? 'stale' : 'storage-error';
    renderRelay();
    announce(runtime.phase === 'stale' ? c().result.stale : c().result.storage);
    return;
  }
  runtime.acceptedTarget = committed.activatedIndex;
  runtime.progress = committed.progress;
  runtime.phase = 'impact';
  renderRelay();
  playCue(committed.completed ? 'complete' : 'lantern');
  announce(c().result.changed);
  const override = Number(globalThis[TEST_IMPACT_MS]);
  const delay = Number.isFinite(override) && override >= 40 ? override : (reducedMotion() ? 100 : 900);
  impactTimer = setTimeout(() => {
    runtime.phase = committed.completed ? 'complete' : 'result';
    renderRelay();
    announce(committed.completed ? c().result.complete : c().result.arrived);
  }, delay);
}

async function shareRelaySnapshot(relay, action, status) {
  const url = buildLivingWorldLightRelayUrl(relay, { baseUrl: location.href });
  const model = createLivingWorldLightRelayMediaModel(relay, getLocale());
  const rendered = await renderLivingWorldLightRelayMedia(model);
  const file = new File([rendered.blob], LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME, { type: rendered.blob.type });
  const payload = createLivingWorldLightRelaySharePayload(model, url);
  if (supportsLivingWorldLightRelayFileShare(navigator, file)) {
    await navigator.share({ ...payload, files: [file] });
    if (status) status.textContent = c().share.shared;
  } else {
    openSharePreview(model, rendered.blob, url, action, LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME);
  }
}
async function shareCompletedChapter(action, status) {
  const chapter = { ...runtime.chapter, progress: runtime.progress };
  const url = buildLivingWorldChapterUrl(chapter, { progress: runtime.progress, baseUrl: location.href });
  const model = createLivingWorldChapterMediaModel(chapter, runtime.progress, getLocale());
  const rendered = await renderLivingWorldChapterMedia(model);
  const file = new File([rendered.blob], LIVING_WORLD_CHAPTER_MEDIA_FILENAME, { type: rendered.blob.type });
  const payload = createLivingWorldChapterSharePayload(model, url);
  if (supportsLivingWorldChapterFileShare(navigator, file)) {
    await navigator.share({ ...payload, files: [file] });
    if (status) status.textContent = chapterCopy().launch.shared;
  } else {
    openSharePreview(model, rendered.blob, url, action, LIVING_WORLD_CHAPTER_MEDIA_FILENAME);
  }
}
async function shareRelayResult(event) {
  const action = event.currentTarget;
  const status = document.querySelector('[data-relay-status]');
  action.disabled = true;
  if (status) status.textContent = c().world.loading;
  try {
    if (runtime.progress >= 8) await shareCompletedChapter(action, status);
    else await shareRelaySnapshot(createLivingWorldLightRelay(runtime.chapter, runtime.progress), action, status);
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (status) status.textContent = c().share.cancelled;
    } else if (status) status.textContent = c().share.failed;
  } finally {
    action.disabled = false;
  }
}
function openSharePreview(model, blob, url, returnFocus, filename) {
  document.querySelector('[data-light-relay-share-dialog]')?.remove();
  revokeShareUrl();
  shareObjectUrl = URL.createObjectURL(blob);
  const dialog = document.createElement('div');
  dialog.className = 'chapter-share-dialog';
  dialog.dataset.lightRelayShareDialog = 'true';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'light-relay-share-title');
  dialog.innerHTML = `<div class="chapter-share-panel">
    <button class="chapter-share-close" type="button" data-light-relay-share-close aria-label="${escapeHtml(c().share.close)}">×</button>
    <h2 id="light-relay-share-title">${escapeHtml(c().share.preview)}</h2>
    <img src="${escapeHtml(shareObjectUrl)}" alt="${escapeHtml(model.alternative)}" width="270" height="480"/>
    <div class="chapter-share-actions">
      <a class="chapter-primary" href="${escapeHtml(shareObjectUrl)}" download="${escapeHtml(filename)}" data-light-relay-save>${escapeHtml(c().share.save)}</a>
      <button class="chapter-secondary" type="button" data-light-relay-copy>${escapeHtml(c().share.copy)}</button>
    </div>
    <p class="chapter-status" aria-live="polite" data-light-relay-share-status></p>
  </div>`;
  document.body.append(dialog);
  const close = () => {
    dialog.remove();
    revokeShareUrl();
    returnFocus?.focus?.({ preventScroll: true });
  };
  dialog.querySelector('[data-light-relay-share-close]')?.addEventListener('click', close);
  dialog.querySelector('[data-light-relay-save]')?.addEventListener('click', () => {
    const message = dialog.querySelector('[data-light-relay-share-status]');
    if (message) message.textContent = c().share.saved;
  });
  dialog.querySelector('[data-light-relay-copy]')?.addEventListener('click', async () => {
    const message = dialog.querySelector('[data-light-relay-share-status]');
    try {
      await navigator.clipboard.writeText(url);
      if (message) message.textContent = c().share.copied;
    } catch {
      if (message) message.textContent = c().share.failed;
    }
  });
  dialog.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') close(); });
  dialog.querySelector('[data-light-relay-share-close]')?.focus();
}

async function interceptChapterShare(event) {
  const action = event.target.closest?.('[data-chapter-share], [data-chapter-result="share"]');
  if (!action) return;
  const route = chapterFromLocation(location.hash);
  if (route.status !== 'ready') return;
  const state = readLivingWorldChapterState(localStorage, route.chapter);
  if (state.status === 'storage-error' || state.progress < 1 || state.progress >= 8) return;
  let relay;
  try { relay = createLivingWorldLightRelay(route.chapter, state.progress); } catch { return; }
  event.preventDefault();
  event.stopImmediatePropagation();
  const status = document.querySelector('[data-chapter-status]');
  action.disabled = true;
  if (status) status.textContent = c().world.loading;
  try {
    await shareRelaySnapshot(relay, action, status);
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (status) status.textContent = c().share.cancelled;
    } else if (status) status.textContent = c().share.failed;
  } finally {
    action.disabled = false;
  }
}
function initializeRelay(relay) {
  clearTimers();
  const resolved = resolveLivingWorldLightRelay(localStorage, relay);
  if (['invalid', 'expired', 'ahead'].includes(resolved.status)) {
    runtime = null;
    renderRecovery();
    return;
  }
  runtime = {
    relay: resolved.relay,
    chapter: resolved.chapter,
    progress: resolved.progress,
    phase: resolved.status === 'stale' ? 'stale' : resolved.status === 'storage-error' ? 'storage-error' : 'ready',
    lockResults: [],
    windowIndex: 0,
    windowProgress: 0,
    acceptedTarget: null,
  };
  renderRelay();
  if (runtime.phase === 'ready') announce(c().world.goal);
}
function mountRelayRoute() {
  syncLocale();
  const route = lightRelayFromLocation(location.hash);
  if (route.status === 'ready') initializeRelay(route.relay);
  else if (route.status === 'invalid' || route.status === 'expired') {
    clearTimers();
    revokeShareUrl();
    runtime = null;
    renderRecovery();
  } else {
    clearTimers();
    revokeShareUrl();
    runtime = null;
  }
}

document.addEventListener('click', interceptChapterShare, true);
document.addEventListener('keydown', event => {
  if (!runtime || runtime.phase !== 'active' || event.repeat || ![' ', 'Enter'].includes(event.key)) return;
  if (event.target.closest?.('[data-tune-relay]')) return;
  event.preventDefault();
  tuneRelay();
});
window.addEventListener('hashchange', mountRelayRoute);
window.addEventListener('beforeunload', revokeShareUrl);
mountRelayRoute();
