import { getLocale } from './i18n.js';
import {
  eventFromLocation,
  LIVING_WORLD_SOUND_KEY,
  readLivingWorldState,
} from './living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  chapterFromLocation,
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
  createOrRestoreReturningThread,
  deriveReturningThreadChapterState,
  readReturningThreadForEvent,
} from './living-world-returning-thread.js';
import { getReturningThreadCopy } from './living-world-returning-thread-i18n.js';
import { renderReturningThreadChapterMedia } from './living-world-returning-thread-media.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RESTORED_ANNOUNCEMENT_KEY = 'creatorverse-returning-thread-restored-v1';
const EXTENDED_ANNOUNCEMENT_KEY = 'creatorverse-returning-thread-extended-v1';
const DISMISS_KEY = 'creatorverse-returning-thread-dismissed-v1';
const app = document.querySelector('#app');
let queued = false;
let shareObjectUrl = '';
let audioContext = null;

function copy() { return getReturningThreadCopy(getLocale()); }
function chapterCopy() { return getLivingWorldChapterCopy(getLocale()); }
function safeStorage(action, fallback = null) { try { return action(); } catch { return fallback; } }
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}
function replaceShareUrl() {
  if (!shareObjectUrl) return;
  try { URL.revokeObjectURL(shareObjectUrl); } catch {}
  shareObjectUrl = '';
}

function structuralPaths(kind, path) {
  const base = `<path class="returning-thread-main" d="${path}" pathLength="100"/>`;
  if (kind === 'folded-braid') {
    return `${base}<path class="returning-thread-pair" d="${path}" pathLength="100"/>`;
  }
  if (kind === 'notched-spine') {
    return `${base}<path class="returning-thread-marks" d="M292 283v-10h14v10m75 15v10h14v-10m75-3v-10h14v10"/>`;
  }
  if (kind === 'twin-latch') {
    return `${base}<path class="returning-thread-pair" d="${path}" pathLength="100"/><path class="returning-thread-marks" d="M306 282l8 8 8-8m70 15 8-8 8 8m70-14 8 8 8-8"/>`;
  }
  return `${base}<path class="returning-thread-marks" d="M300 278l12 12m76 2 12 12m76-18 12 12"/>`;
}

function addAccessibleDescription(svg, text) {
  const existing = svg.parentElement?.querySelector('[data-returning-thread-alt]');
  if (existing) existing.remove();
  const description = document.createElement('span');
  description.className = 'returning-thread-sr-only';
  description.dataset.returningThreadAlt = 'true';
  description.textContent = text;
  svg.insertAdjacentElement('afterend', description);
}

function injectPredecessorThread(root, thread) {
  const svg = root.querySelector('[data-world-scene]');
  if (!svg || svg.querySelector('[data-returning-thread]')) return;
  const active = root.querySelectorAll('.loom-slat.is-woven').length;
  const group = svgElement('g', {
    class: `returning-thread returning-thread-${thread.kind}`,
    'data-returning-thread': 'predecessor',
    'aria-hidden': 'true',
  });
  group.style.setProperty('--returning-thread-visible', `${Math.max(1, active) / 12}`);
  group.innerHTML = structuralPaths(thread.kind, 'M220 258 Q400 318 580 258');
  const bridge = svg.querySelector('.loom-slats');
  bridge?.insertAdjacentElement('afterend', group);
  addAccessibleDescription(svg, copy().restoredAlternative);
}

function addPredecessorCopy(root, status, thread) {
  const result = root.querySelector('.living-world-result-copy');
  if (!result || result.querySelector('[data-returning-thread-copy], [data-returning-thread-recovery]')) return;
  if (thread) {
    const block = document.createElement('div');
    block.className = 'returning-thread-copy';
    block.dataset.returningThreadCopy = 'true';
    block.innerHTML = `<strong>${escapeHtml(copy().label)}</strong><span>${escapeHtml(copy().woven)}</span>`;
    result.querySelector('.living-world-primary')?.insertAdjacentElement('beforebegin', block);
    return;
  }
  if (!['invalid', 'unavailable'].includes(status)) return;
  const route = eventFromLocation(location.hash);
  const dismissId = route.status === 'ready' ? route.event.eventId : 'event';
  if (safeStorage(() => sessionStorage.getItem(DISMISS_KEY) === dismissId, false)) return;
  const recovery = document.createElement('div');
  recovery.className = 'returning-thread-recovery';
  recovery.dataset.returningThreadRecovery = 'true';
  recovery.innerHTML = `<span>${escapeHtml(copy().worldSavedUnavailable)}</span><button type="button">${escapeHtml(copy().continue)}</button>`;
  recovery.querySelector('button')?.addEventListener('click', () => {
    safeStorage(() => sessionStorage.setItem(DISMISS_KEY, dismissId));
    recovery.remove();
  });
  result.querySelector('.living-world-primary')?.insertAdjacentElement('beforebegin', recovery);
}

function applyPredecessor() {
  const root = document.querySelector('[data-living-world][data-route="event"]');
  if (!root) return;
  const route = eventFromLocation(location.hash);
  if (route.status !== 'ready') return;
  const phase = root.dataset.phase;
  if (!['impact', 'result', 'complete', 'duplicate'].includes(phase)) return;
  const localState = readLivingWorldState(localStorage, route.event);
  if (!localState.contributed || localState.status !== 'duplicate') return;
  const created = createOrRestoreReturningThread(localStorage, route.event);
  const thread = created.thread || readReturningThreadForEvent(localStorage, route.event).thread;
  const signature = `${getLocale()}:${phase}:${thread?.kind || created.status}`;
  if (root.dataset.returningThreadApplied === signature) return;
  root.dataset.returningThreadApplied = signature;
  if (thread) injectPredecessorThread(root, thread);
  addPredecessorCopy(root, created.status, thread);
}

function lanternCoordinates(index) {
  const x = 430 + index * 37;
  const y = 230 - Math.round(Math.sin((index / 7) * Math.PI) * 56) - index * 4;
  return { x: x + 11, y: y + 34 };
}

function injectChapterThread(root, state) {
  const svg = root.querySelector('[data-chapter-world-scene]');
  if (!svg || svg.querySelector('[data-returning-thread]')) return;
  const group = svgElement('g', {
    class: `returning-thread returning-thread-${state.thread.kind} ${state.extended ? 'is-extended' : ''}`,
    'data-returning-thread': 'chapter',
    'aria-hidden': 'true',
  });
  group.innerHTML = structuralPaths(state.thread.kind, 'M104 392 C236 448 390 410 522 336');
  if (state.extended) {
    const end = lanternCoordinates(state.lanternIndex);
    const extension = svgElement('path', {
      class: 'returning-thread-extension',
      d: `M522 336 C550 294 ${end.x - 54} ${end.y + 48} ${end.x} ${end.y}`,
      pathLength: '100',
    });
    group.append(extension);
  } else {
    group.append(svgElement('path', { class: 'returning-thread-junction', d: 'M515 330h14v14h-14z' }));
  }
  svg.querySelector('.completed-loombridge')?.insertAdjacentElement('afterend', group);
  addAccessibleDescription(svg, state.extended ? copy().extendedAlternative : copy().restoredAlternative);
}

function addChapterLabel(root, state) {
  if (root.querySelector('[data-returning-thread-label]')) return;
  const stage = root.querySelector('.chapter-stage');
  if (!stage) return;
  const label = document.createElement('p');
  label.className = 'returning-thread-label';
  label.dataset.returningThreadLabel = 'true';
  label.textContent = copy().label;
  stage.append(label);
  if (state.extended && ['result', 'complete'].includes(root.dataset.phase)) {
    const impact = root.querySelector('.chapter-result-copy p');
    if (impact) impact.textContent = copy().extended;
  }
}

function addChapterRecovery(root, status) {
  if (!['invalid', 'unavailable'].includes(status) || root.querySelector('[data-returning-thread-recovery]')) return;
  const actions = root.querySelector('.chapter-actions, .chapter-result-copy');
  if (!actions) return;
  const recovery = document.createElement('div');
  recovery.className = 'returning-thread-recovery';
  recovery.dataset.returningThreadRecovery = 'true';
  recovery.innerHTML = `<span>${escapeHtml(copy().deviceUnavailable)}</span><button type="button">${escapeHtml(copy().dismiss)}</button>`;
  recovery.querySelector('button')?.addEventListener('click', () => recovery.remove());
  actions.prepend(recovery);
}

function announceChapter(root, state) {
  const region = root.querySelector('[data-chapter-announcement]');
  if (!region) return;
  const route = chapterFromLocation(location.hash);
  if (route.status !== 'ready') return;
  if (state.extended && root.dataset.phase === 'impact') {
    const key = `${route.chapter.chapterId}:${state.progress}`;
    if (safeStorage(() => sessionStorage.getItem(EXTENDED_ANNOUNCEMENT_KEY) === key, false)) return;
    safeStorage(() => sessionStorage.setItem(EXTENDED_ANNOUNCEMENT_KEY, key));
    region.textContent = copy().extendedAnnouncement;
    playFiberCue();
    return;
  }
  const key = route.chapter.chapterId;
  if (safeStorage(() => sessionStorage.getItem(RESTORED_ANNOUNCEMENT_KEY) === key, false)) return;
  safeStorage(() => sessionStorage.setItem(RESTORED_ANNOUNCEMENT_KEY, key));
  region.textContent = copy().restoredAnnouncement;
}

function playFiberCue() {
  if (safeStorage(() => localStorage.getItem(LIVING_WORLD_SOUND_KEY) !== 'on', true)) return;
  const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Constructor) return;
  try {
    if (!audioContext) audioContext = new Constructor();
    audioContext.resume?.();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = 248;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.022, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  } catch {}
}

function applyChapter() {
  const root = document.querySelector('[data-living-chapter][data-route="chapter"]');
  if (!root) return;
  const route = chapterFromLocation(location.hash);
  if (route.status !== 'ready') return;
  const state = deriveReturningThreadChapterState(localStorage, route.chapter);
  const signature = `${getLocale()}:${root.dataset.phase}:${state.status}:${state.thread?.kind || ''}:${state.extended}:${state.progress || 0}`;
  if (root.dataset.returningThreadApplied === signature) return;
  root.dataset.returningThreadApplied = signature;
  if (state.status === 'ready') {
    injectChapterThread(root, state);
    addChapterLabel(root, state);
    announceChapter(root, state);
  } else {
    addChapterRecovery(root, state.status);
  }
}

async function handleThreadShare(event) {
  const action = event.target.closest?.('[data-chapter-share], [data-chapter-result="share"]');
  if (!action) return;
  const route = chapterFromLocation(location.hash);
  if (route.status !== 'ready') return;
  const state = deriveReturningThreadChapterState(localStorage, route.chapter);
  if (state.status !== 'ready') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const status = document.querySelector('[data-chapter-status]');
  action.disabled = true;
  if (status) status.textContent = chapterCopy().world.loading;
  const url = buildLivingWorldChapterUrl(route.chapter, { progress: state.progress, baseUrl: location.href });
  try {
    const model = createLivingWorldChapterMediaModel(route.chapter, state.progress, getLocale());
    const base = await renderLivingWorldChapterMedia(model);
    const rendered = await renderReturningThreadChapterMedia(base.blob, state.thread, {
      extended: state.extended,
      lanternIndex: state.lanternIndex,
    });
    const file = new File([rendered.blob], LIVING_WORLD_CHAPTER_MEDIA_FILENAME, { type: rendered.blob.type });
    const payload = createLivingWorldChapterSharePayload(model, url);
    if (supportsLivingWorldChapterFileShare(navigator, file)) {
      await navigator.share({ ...payload, files: [file] });
      if (status) status.textContent = chapterCopy().launch.shared;
    } else {
      openSharePreview(model, rendered.blob, url, action);
    }
  } catch (error) {
    if (error?.name !== 'AbortError' && status) status.textContent = chapterCopy().share.failed;
  } finally {
    action.disabled = false;
  }
}

function openSharePreview(model, blob, url, returnFocus) {
  document.querySelector('[data-returning-thread-share-dialog]')?.remove();
  replaceShareUrl();
  shareObjectUrl = URL.createObjectURL(blob);
  const dialog = document.createElement('div');
  dialog.className = 'chapter-share-dialog';
  dialog.dataset.returningThreadShareDialog = 'true';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'returning-thread-share-title');
  dialog.innerHTML = `<div class="chapter-share-panel">
    <button class="chapter-share-close" type="button" data-returning-thread-share-close aria-label="${escapeHtml(chapterCopy().share.close)}">×</button>
    <h2 id="returning-thread-share-title">${escapeHtml(chapterCopy().share.preview)}</h2>
    <img src="${escapeHtml(shareObjectUrl)}" alt="${escapeHtml(model.alternative)}" width="270" height="480"/>
    <div class="chapter-share-actions">
      <a class="chapter-primary" href="${escapeHtml(shareObjectUrl)}" download="${LIVING_WORLD_CHAPTER_MEDIA_FILENAME}" data-returning-thread-save>${escapeHtml(chapterCopy().share.save)}</a>
      <button class="chapter-secondary" type="button" data-returning-thread-copy>${escapeHtml(chapterCopy().share.copy)}</button>
    </div>
    <p class="chapter-status" aria-live="polite" data-returning-thread-share-status></p>
  </div>`;
  document.body.append(dialog);
  const close = () => {
    dialog.remove();
    replaceShareUrl();
    returnFocus?.focus?.({ preventScroll: true });
  };
  dialog.querySelector('[data-returning-thread-share-close]')?.addEventListener('click', close);
  dialog.querySelector('[data-returning-thread-save]')?.addEventListener('click', () => {
    const message = dialog.querySelector('[data-returning-thread-share-status]');
    if (message) message.textContent = chapterCopy().share.saved;
  });
  dialog.querySelector('[data-returning-thread-copy]')?.addEventListener('click', async () => {
    const message = dialog.querySelector('[data-returning-thread-share-status]');
    try {
      await navigator.clipboard.writeText(url);
      if (message) message.textContent = chapterCopy().share.copied;
    } catch {
      if (message) message.textContent = chapterCopy().share.failed;
    }
  });
  dialog.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') close(); });
  dialog.querySelector('[data-returning-thread-share-close]')?.focus();
}

function process() {
  queued = false;
  applyPredecessor();
  applyChapter();
}
function queueProcess() {
  if (queued) return;
  queued = true;
  queueMicrotask(process);
}

const observer = new MutationObserver(queueProcess);
if (app) observer.observe(app, { childList: true, subtree: true });
window.addEventListener('hashchange', queueProcess);
document.addEventListener('click', handleThreadShare, true);
window.addEventListener('beforeunload', replaceShareUrl);
queueProcess();
