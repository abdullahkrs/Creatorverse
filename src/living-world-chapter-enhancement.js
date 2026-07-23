import { getLocale, setLocale } from './i18n.js';
import {
  eventFromLocation,
  LIVING_WORLD_SOUND_KEY,
  readLivingWorldState,
} from './living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  chapterFromLocation,
  commitLivingWorldChapterContribution,
  createOrResumeLivingWorldChapter,
  deriveSignalLanterns,
  evaluateSignalLocks,
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  LIVING_WORLD_PREDECESSOR_OWNER_KEY,
  readLivingWorldChapterState,
} from './living-world-chapter.js';
import { formatLivingWorldChapterCopy, getLivingWorldChapterCopy } from './living-world-chapter-i18n.js';
import {
  createLivingWorldChapterMediaModel,
  createLivingWorldChapterSharePayload,
  LIVING_WORLD_CHAPTER_MEDIA_FILENAME,
  renderLivingWorldChapterMedia,
  supportsLivingWorldChapterFileShare,
} from './living-world-chapter-media.js';

const TEST_WINDOW_MS = '__CREATORVERSE_CHAPTER_WINDOW_MS__';
const TEST_IMPACT_MS = '__CREATORVERSE_CHAPTER_IMPACT_MS__';
const app = document.querySelector('#app');

let runtime = null;
let launchDuration = '6h';
let frame = 0;
let impactTimer = 0;
let audioContext = null;
let shareObjectUrl = '';
let observerQueued = false;

function c() { return getLivingWorldChapterCopy(getLocale()); }
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
  return formatLivingWorldChapterCopy(template, Object.fromEntries(
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
    pass: [[330, 0, 0.08, 0.035]],
    miss: [[150, 0, 0.07, 0.025]],
    travel: [[220, 0, 0.14, 0.035], [294, 0.1, 0.16, 0.03]],
    lantern: [[392, 0, 0.1, 0.035], [294, 0.11, 0.16, 0.035]],
    complete: [[294, 0, 0.1, 0.04], [392, 0.1, 0.1, 0.04], [220, 0.22, 0.24, 0.04]],
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
  return `<svg class="chapter-emblem" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(c().aria.emblem)}"><path d="M5 24V9l5-4v15m17 4V9l-5-4v15M10 12h12M10 17h12M10 22h12"/></svg>`;
}

function utilities() {
  const copy = c();
  const supported = soundSupported();
  const enabled = soundEnabled();
  return `<div class="chapter-utilities" aria-label="${escapeHtml(copy.aria.utility)}">
    <div class="chapter-language" aria-label="${escapeHtml(copy.world.language)}">
      <button type="button" data-chapter-locale="en" aria-pressed="${getLocale() === 'en'}" aria-label="${escapeHtml(copy.world.english)}">EN</button>
      <button type="button" data-chapter-locale="ar" aria-pressed="${getLocale() === 'ar'}" aria-label="${escapeHtml(copy.world.arabic)}">ع</button>
    </div>
    <button class="chapter-sound" type="button" data-chapter-sound aria-pressed="${enabled}" ${supported ? '' : 'disabled'} aria-label="${escapeHtml(supported ? (enabled ? copy.world.soundOn : copy.world.soundOff) : copy.world.soundUnavailable)}">
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

function lanternMarkup(progress) {
  return deriveSignalLanterns(progress).map(({ index, active }) => {
    const x = 430 + index * 37;
    const y = 230 - Math.round(Math.sin((index / 7) * Math.PI) * 56) - index * 4;
    return `<g class="signal-lantern ${active ? 'is-active' : ''}" data-lantern-index="${index}" transform="translate(${x} ${y})">
      <path class="lantern-stem" d="M0 110 9 35 24 110Z"/>
      <path class="lantern-shutter lantern-shutter-start" d="M-15 38 4 15 8 62-11 75Z"/>
      <path class="lantern-shutter lantern-shutter-end" d="M15 14 37 37 30 76 12 62Z"/>
      <circle class="lantern-core" cx="11" cy="34" r="9"/>
      <path class="lantern-path" d="M11 108 48 118"/>
      <path class="lantern-detail" d="M-8 126h48m-35 8 9-8 8 8"/>
    </g>`;
  }).join('');
}

function worldScene(progress, phase = 'ready') {
  const complete = progress >= 8;
  return `<svg class="far-shore-world ${complete ? 'is-complete' : ''} ${phase === 'impact' ? 'is-impacting' : ''}" viewBox="0 0 800 560" role="img" aria-label="${escapeHtml(c().aria.world)}" data-chapter-world-scene>
    <path class="chapter-sky chapter-sky-one" d="M0 0h800v180L654 148 520 178 394 130 258 176 124 144 0 172Z"/>
    <path class="chapter-sky chapter-sky-two" d="M0 126 130 94l126 44 134-31 148 47 122-31 140 43v112H0Z"/>
    <path class="far-ridge" d="M224 292 358 222l132 26 118-70 192 72v192H214Z"/>
    <g class="completed-loombridge" role="img" aria-label="${escapeHtml(c().aria.bridge)}">
      <path class="chapter-bridge-cord" d="M86 374Q300 492 522 316"/>
      <path class="chapter-bridge-cord" d="M92 414Q305 522 532 356"/>
      ${Array.from({ length: 12 }, (_, index) => {
        const x = 128 + index * 32;
        const y = 392 + Math.round(Math.sin((index / 11) * Math.PI) * 62) - index * 8;
        return `<path class="chapter-bridge-slat" d="M${x} ${y}l28-4 5 13-28 5Z"/>`;
      }).join('')}
    </g>
    <g class="signal-grove" role="img" aria-label="${escapeHtml(c().aria.lanterns)}">${lanternMarkup(progress)}</g>
    <g class="inhabited-field" aria-hidden="true">
      <path d="M548 346h28v44h-28zM602 326h24v39h-24zM654 348h31v48h-31zM710 316h28v42h-28z"/>
      <path class="field-plants" d="M515 421q17-42 34 0 15-49 31 0 16-38 34 0 16-47 33 0 17-40 36 0"/>
    </g>
    <path class="chapter-mist" d="M0 372q145-45 298 2t286-2q104-35 216 9v116H0Z"/>
    <path class="near-shore" d="M0 430 160 392l126 42 126-22 118 42 128-26 142 40 100-17v109H0Z"/>
    <path class="chapter-energy-route" d="M114 460C210 438 244 402 315 368S430 332 500 306s92-22 142-42"/>
    <g class="chapter-resonators ${phase === 'active' ? 'is-active' : ''}" aria-hidden="true">
      <path class="resonator-line" d="M118 490H682"/>
      <path class="resonator-notch" d="M244 474h22v34h-22zM390 474h22v34h-22zM536 474h22v34h-22z"/>
      <circle class="resonator-pulse" cx="128" cy="491" r="12" data-chapter-pulse/>
    </g>
  </svg>`;
}

function progressMarkup(progress) {
  const remaining = Math.max(0, 8 - progress);
  return `<div class="chapter-progress" role="progressbar" aria-label="${escapeHtml(c().aria.progress)}" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${progress}">
    <strong><bdi>${localizedNumber(progress)} / ${localizedNumber(8)}</bdi></strong>
    <span>${escapeHtml(interpolate(c().world.goal, { count: remaining }))}</span>
  </div>`;
}

function phaseCopy() {
  if (runtime.phase === 'failed') return { title: c().result.failed, primary: c().result.retry, action: 'retry' };
  if (runtime.phase === 'duplicate') return { title: c().result.duplicate, primary: c().result.view, action: 'view' };
  if (runtime.phase === 'storage-error') return { title: c().result.settledError, primary: c().result.tryAgain, action: 'retry' };
  if (runtime.phase === 'complete') return { title: c().result.complete, impact: c().result.completeImpact, primary: c().result.shareOpening, action: 'share' };
  if (runtime.phase === 'result') return { title: c().result.reached, impact: c().result.impact, primary: c().result.share, action: 'share' };
  return null;
}

function renderChapter() {
  revokeShareUrl();
  const result = phaseCopy();
  const owner = runtime.owner;
  app.innerHTML = `<main class="living-world-chapter" data-living-chapter data-route="chapter" data-phase="${escapeHtml(runtime.phase)}" data-notch-active="false" data-window-index="0">
    ${creatorStrip()}
    <section class="chapter-stage ${result ? 'has-result' : ''}" aria-labelledby="chapter-title" data-chapter-share-composition>
      ${worldScene(runtime.progress, runtime.phase)}
      <div class="chapter-title-block ${runtime.phase === 'active' ? 'is-receded' : ''}">
        <h1 id="chapter-title">${escapeHtml(c().world.title)}</h1>
        ${progressMarkup(runtime.progress)}
      </div>
      ${owner ? `<div class="chapter-actions">
        <button class="chapter-primary" type="button" data-chapter-share>${escapeHtml(c().launch.share)}</button>
        <button class="chapter-secondary" type="button" data-chapter-view>${escapeHtml(c().launch.view)}</button>
        <p class="chapter-status" aria-live="polite" data-chapter-status></p>
      </div>` : ''}
      ${!owner && runtime.phase === 'ready' ? `<div class="chapter-actions">
        <p class="chapter-hint">${escapeHtml(c().world.hint)}</p>
        <button class="chapter-primary" type="button" data-start-signal>${escapeHtml(c().world.send)}</button>
        <p class="chapter-status" aria-live="polite" data-chapter-status></p>
      </div>` : ''}
      ${!owner && runtime.phase === 'active' ? `<div class="chapter-active" aria-label="${escapeHtml(c().aria.contribution)}">
        <strong>${escapeHtml(c().active.status)}</strong>
        <span data-signal-counter>${escapeHtml(interpolate(c().active.counter, { current: 1 }))}</span>
        <button class="chapter-primary chapter-tune" type="button" data-tune-signal>${escapeHtml(c().active.tune)}</button>
      </div>` : ''}
      ${!owner && runtime.phase === 'impact' ? `<div class="chapter-impact-label" aria-live="polite">${escapeHtml(c().result.progressChanged)}</div>` : ''}
      ${!owner && result ? `<div class="chapter-result-copy">
        <h2>${escapeHtml(result.title)}</h2>
        ${result.impact ? `<p>${escapeHtml(result.impact)}</p>` : ''}
        <button class="chapter-primary" type="button" data-chapter-result="${result.action}">${escapeHtml(result.primary)}</button>
        <p class="chapter-status" aria-live="polite" data-chapter-status></p>
      </div>` : ''}
    </section>
    <div class="chapter-live" aria-live="polite" aria-atomic="true" data-chapter-announcement></div>
  </main>`;
  bindChapterControls();
}

function renderRecovery(state) {
  runtime = null;
  app.innerHTML = `<main class="living-world-chapter chapter-recovery" data-living-chapter data-route="recovery" data-state="${escapeHtml(state)}">
    ${creatorStrip()}
    <section class="chapter-stage" aria-labelledby="chapter-recovery-title">
      ${worldScene(0, 'unavailable')}
      <div class="chapter-result-copy"><h1 id="chapter-recovery-title">${escapeHtml(c().recovery.unavailable)}</h1><a class="chapter-primary" href="/">${escapeHtml(c().recovery.return)}</a></div>
    </section>
  </main>`;
  bindUtilityControls();
}

function announce(message) {
  const region = document.querySelector('[data-chapter-announcement]');
  if (region) region.textContent = message;
}

function bindUtilityControls() {
  document.querySelectorAll('[data-chapter-locale]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.chapterLocale === getLocale()) return;
    setLocale(button.dataset.chapterLocale);
    syncLocale();
    if (runtime) renderChapter();
    else if (chapterFromLocation(location.hash).status !== 'none') mountChapterRoute();
    else injectNextChapterAction();
  }));
  document.querySelector('[data-chapter-sound]')?.addEventListener('click', () => {
    if (!soundSupported()) return;
    const next = !soundEnabled();
    safeStorage(() => localStorage.setItem(LIVING_WORLD_SOUND_KEY, next ? 'on' : 'off'));
    if (runtime) renderChapter();
  });
}

function bindChapterControls() {
  bindUtilityControls();
  document.querySelector('[data-start-signal]')?.addEventListener('click', startSignal);
  document.querySelector('[data-tune-signal]')?.addEventListener('click', tuneSignal);
  document.querySelector('[data-chapter-world-scene]')?.addEventListener('pointerdown', event => {
    if (runtime?.phase === 'active' && !event.target.closest('button')) tuneSignal();
  });
  document.querySelector('[data-chapter-share]')?.addEventListener('click', shareChapter);
  document.querySelector('[data-chapter-view]')?.addEventListener('click', () => {
    safeStorage(() => sessionStorage.removeItem(LIVING_WORLD_CHAPTER_OWNER_KEY));
    runtime.owner = false;
    runtime.phase = runtime.progress >= 8 ? 'complete' : 'ready';
    renderChapter();
  });
  document.querySelector('[data-chapter-result="share"]')?.addEventListener('click', shareChapter);
  document.querySelector('[data-chapter-result="retry"]')?.addEventListener('click', () => {
    runtime.phase = 'ready';
    runtime.lockResults = [];
    renderChapter();
  });
  document.querySelector('[data-chapter-result="view"]')?.addEventListener('click', () => {
    runtime.phase = runtime.progress >= 8 ? 'complete' : 'ready';
    renderChapter();
  });
}

function startSignal() {
  clearRuntimeTimers();
  runtime.phase = 'active';
  runtime.lockResults = [];
  runtime.windowIndex = 0;
  runtime.windowProgress = 0;
  runtime.windowStart = performance.now();
  renderChapter();
  announce(c().active.started);
  frame = requestAnimationFrame(updateSignal);
}
function signalWindowDuration() {
  const override = Number(globalThis[TEST_WINDOW_MS]);
  return Number.isFinite(override) && override >= 120 ? override : 4000;
}
function updateSignal(now) {
  if (!runtime || runtime.phase !== 'active') return;
  const duration = signalWindowDuration();
  const elapsed = Math.max(0, now - runtime.windowStart);
  const index = Math.min(3, Math.floor(elapsed / duration));
  while (runtime.lockResults.length < Math.min(index, 3)) runtime.lockResults.push(false);
  if (index >= 3) { finishSignal(); return; }
  runtime.windowIndex = index;
  runtime.windowProgress = Math.max(0, Math.min(1, (elapsed - index * duration) / duration));
  const active = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58 && runtime.lockResults.length === index;
  const root = document.querySelector('[data-living-chapter]');
  const pulse = document.querySelector('[data-chapter-pulse]');
  const counter = document.querySelector('[data-signal-counter]');
  if (root) {
    root.dataset.notchActive = String(active);
    root.dataset.windowIndex = String(index);
  }
  if (pulse) pulse.setAttribute('cx', String(128 + runtime.windowProgress * 544));
  if (counter) counter.textContent = interpolate(c().active.counter, { current: index + 1 });
  frame = requestAnimationFrame(updateSignal);
}
function tuneSignal() {
  if (!runtime || runtime.phase !== 'active') return;
  const index = runtime.windowIndex;
  if (runtime.lockResults.length !== index) return;
  const success = runtime.windowProgress >= 0.42 && runtime.windowProgress <= 0.58;
  runtime.lockResults.push(success);
  playCue(success ? 'pass' : 'miss');
  vibrate(success ? 16 : 7);
  announce(interpolate(success ? c().active.locked : c().active.missed, { count: index + 1 }));
  const root = document.querySelector('[data-living-chapter]');
  if (root) root.dataset.notchActive = 'false';
}
function finishSignal() {
  clearRuntimeTimers();
  while (runtime.lockResults.length < 3) runtime.lockResults.push(false);
  const result = evaluateSignalLocks(runtime.lockResults);
  if (!result.accepted) {
    runtime.phase = 'failed';
    renderChapter();
    announce(c().result.failed);
    return;
  }
  const committed = commitLivingWorldChapterContribution(localStorage, runtime.chapter);
  if (committed.status === 'storage-error') {
    runtime.phase = 'storage-error';
    renderChapter();
    announce(c().result.settledError);
    return;
  }
  if (committed.status === 'duplicate') {
    runtime.progress = committed.progress;
    runtime.phase = 'duplicate';
    renderChapter();
    announce(c().result.duplicate);
    return;
  }
  runtime.progress = committed.progress;
  runtime.phase = 'impact';
  renderChapter();
  playCue(committed.completed ? 'complete' : 'lantern');
  vibrate(committed.completed ? [18, 30, 24] : [16, 24, 16]);
  announce(c().result.progressChanged);
  const override = Number(globalThis[TEST_IMPACT_MS]);
  const delay = Number.isFinite(override) && override >= 40 ? override : (reducedMotion() ? 120 : 950);
  impactTimer = setTimeout(() => {
    runtime.phase = committed.completed ? 'complete' : 'result';
    renderChapter();
    announce(committed.completed ? c().result.complete : c().result.reached);
  }, delay);
}

async function shareChapter() {
  if (!runtime?.chapter) return;
  const action = document.querySelector('[data-chapter-share], [data-chapter-result="share"]');
  const status = document.querySelector('[data-chapter-status]');
  if (action) action.disabled = true;
  if (status) status.textContent = c().world.loading;
  const chapterUrl = buildLivingWorldChapterUrl(runtime.chapter, { progress: runtime.progress, baseUrl: location.href });
  try {
    const model = createLivingWorldChapterMediaModel(runtime.chapter, runtime.progress, getLocale());
    const rendered = await renderLivingWorldChapterMedia(model);
    const file = new File([rendered.blob], LIVING_WORLD_CHAPTER_MEDIA_FILENAME, { type: rendered.blob.type });
    const payload = createLivingWorldChapterSharePayload(model, chapterUrl);
    if (supportsLivingWorldChapterFileShare(navigator, file)) {
      await navigator.share({ ...payload, files: [file] });
      if (status) status.textContent = c().launch.shared;
    } else {
      openSharePreview(model, rendered.blob, chapterUrl, action);
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
  dialog.className = 'chapter-share-dialog';
  dialog.dataset.chapterShareDialog = 'true';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'chapter-share-title');
  dialog.innerHTML = `<div class="chapter-share-panel">
    <button class="chapter-share-close" type="button" data-chapter-share-close aria-label="${escapeHtml(c().share.close)}">×</button>
    <h2 id="chapter-share-title">${escapeHtml(c().share.preview)}</h2>
    <img src="${escapeHtml(shareObjectUrl)}" alt="${escapeHtml(model.alternative)}" width="270" height="480"/>
    <div class="chapter-share-actions">
      <a class="chapter-primary" href="${escapeHtml(shareObjectUrl)}" download="${LIVING_WORLD_CHAPTER_MEDIA_FILENAME}" data-chapter-save>${escapeHtml(c().share.save)}</a>
      <button class="chapter-secondary" type="button" data-chapter-copy>${escapeHtml(c().share.copy)}</button>
    </div>
    <p class="chapter-status" aria-live="polite" data-chapter-share-status></p>
  </div>`;
  document.body.append(dialog);
  const close = () => {
    dialog.remove();
    revokeShareUrl();
    returnFocus?.focus?.({ preventScroll: true });
  };
  dialog.querySelector('[data-chapter-share-close]')?.addEventListener('click', close);
  dialog.querySelector('[data-chapter-save]')?.addEventListener('click', () => {
    const message = dialog.querySelector('[data-chapter-share-status]');
    if (message) message.textContent = c().share.saved;
  });
  dialog.querySelector('[data-chapter-copy]')?.addEventListener('click', async () => {
    const message = dialog.querySelector('[data-chapter-share-status]');
    try {
      await navigator.clipboard.writeText(url);
      if (message) message.textContent = c().share.copied;
    } catch {
      if (message) message.textContent = c().share.failed;
    }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  dialog.querySelector('[data-chapter-share-close]')?.focus();
}

function eligiblePredecessor() {
  const route = eventFromLocation(location.hash);
  if (route.status !== 'ready') return null;
  const owner = safeStorage(() => sessionStorage.getItem(LIVING_WORLD_PREDECESSOR_OWNER_KEY) === route.event.eventId, false);
  const state = readLivingWorldState(localStorage, route.event);
  if (!owner || state.status === 'storage-error' || state.progress < route.event.target) return null;
  const root = document.querySelector('[data-living-world][data-route="event"][data-phase="complete"]');
  if (!root) return null;
  return { ...route.event, progress: route.event.target };
}

function injectNextChapterAction() {
  if (location.hash.startsWith('#world-chapter=')) return;
  const predecessor = eligiblePredecessor();
  if (!predecessor) return;
  const actions = document.querySelector('[data-living-world][data-route="event"] .living-world-actions');
  if (!actions || actions.querySelector('[data-next-chapter]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'living-world-secondary chapter-next-action';
  button.dataset.nextChapter = 'true';
  button.textContent = c().predecessor.next;
  button.addEventListener('click', () => openChapterLaunch(predecessor, button));
  actions.append(button);
}

function openChapterLaunch(predecessor, returnFocus) {
  document.querySelector('[data-chapter-launch-sheet]')?.remove();
  const stage = document.querySelector('[data-living-world][data-route="event"] .living-world-stage');
  if (!stage) return;
  const sheet = document.createElement('section');
  sheet.className = 'chapter-launch-sheet';
  sheet.dataset.chapterLaunchSheet = 'true';
  sheet.setAttribute('aria-labelledby', 'chapter-launch-title');
  sheet.innerHTML = `<button class="chapter-launch-close" type="button" data-chapter-launch-close aria-label="${escapeHtml(c().launch.close)}">×</button>
    <div class="chapter-launch-preview" aria-hidden="true">${worldScene(0, 'preview')}</div>
    <h2 id="chapter-launch-title">${escapeHtml(c().launch.title)}</h2>
    <fieldset><legend>${escapeHtml(c().launch.duration)}</legend><div class="chapter-segments">
      <button type="button" data-chapter-duration="6h" aria-pressed="${launchDuration === '6h'}">${escapeHtml(c().launch.sixHours)}</button>
      <button type="button" data-chapter-duration="24h" aria-pressed="${launchDuration === '24h'}">${escapeHtml(c().launch.day)}</button>
    </div></fieldset>
    <p class="chapter-target"><span>${escapeHtml(c().launch.target)}</span><bdi>${localizedNumber(8)}</bdi></p>
    <button class="chapter-primary" type="button" data-launch-chapter>${escapeHtml(c().launch.launch)}</button>
    <p class="chapter-status" aria-live="polite" data-chapter-launch-status></p>`;
  stage.append(sheet);
  const close = () => { sheet.remove(); returnFocus?.focus?.({ preventScroll: true }); };
  sheet.querySelector('[data-chapter-launch-close]')?.addEventListener('click', close);
  sheet.querySelectorAll('[data-chapter-duration]').forEach(button => button.addEventListener('click', () => {
    launchDuration = button.dataset.chapterDuration;
    sheet.querySelectorAll('[data-chapter-duration]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  sheet.querySelector('[data-launch-chapter]')?.addEventListener('click', () => launchChapter(predecessor, sheet));
  sheet.querySelector('[data-chapter-launch-close]')?.focus();
}

function launchChapter(predecessor, sheet) {
  const action = sheet.querySelector('[data-launch-chapter]');
  const status = sheet.querySelector('[data-chapter-launch-status]');
  if (action) action.disabled = true;
  if (status) status.textContent = c().launch.launching;
  const result = createOrResumeLivingWorldChapter(localStorage, predecessor, { duration: launchDuration });
  if (!['created', 'resumed'].includes(result.status)) {
    if (action) action.disabled = false;
    if (status) status.textContent = c().launch.failed;
    return;
  }
  safeStorage(() => sessionStorage.setItem(LIVING_WORLD_CHAPTER_OWNER_KEY, result.chapter.chapterId));
  location.hash = buildLivingWorldChapterUrl(result.chapter, { baseUrl: location.href }).split('#')[1];
}

function initializeChapter(chapter) {
  clearRuntimeTimers();
  const state = readLivingWorldChapterState(localStorage, chapter);
  const owner = safeStorage(() => sessionStorage.getItem(LIVING_WORLD_CHAPTER_OWNER_KEY) === chapter.chapterId, false);
  runtime = {
    chapter,
    progress: state.progress,
    owner,
    phase: owner ? (state.progress >= 8 ? 'complete' : 'owner')
      : state.status === 'storage-error' ? 'storage-error'
        : state.status === 'duplicate' ? 'duplicate'
          : state.progress >= 8 ? 'complete' : 'ready',
    lockResults: [],
    windowIndex: 0,
    windowProgress: 0,
  };
  renderChapter();
}

function mountChapterRoute() {
  syncLocale();
  const route = chapterFromLocation(location.hash);
  if (route.status === 'ready') initializeChapter(route.chapter);
  else if (route.status === 'invalid' || route.status === 'expired') {
    clearRuntimeTimers();
    revokeShareUrl();
    renderRecovery(route.status);
  } else {
    clearRuntimeTimers();
    revokeShareUrl();
    runtime = null;
    queueMicrotask(injectNextChapterAction);
  }
}

function queueInjection() {
  if (observerQueued) return;
  observerQueued = true;
  queueMicrotask(() => {
    observerQueued = false;
    injectNextChapterAction();
  });
}

const observer = new MutationObserver(queueInjection);
if (app) observer.observe(app, { childList: true, subtree: true });
window.addEventListener('hashchange', mountChapterRoute);
document.addEventListener('keydown', event => {
  if (!runtime || runtime.phase !== 'active' || event.repeat || ![' ', 'Enter'].includes(event.key)) return;
  if (event.target.closest?.('[data-tune-signal]')) return;
  event.preventDefault();
  tuneSignal();
});
window.addEventListener('beforeunload', revokeShareUrl);

mountChapterRoute();
