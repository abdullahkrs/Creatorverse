import { getLocale } from './i18n.js';
import { getDistrictProgressCopy } from './district-progress-i18n.js';
import { parsePrototypeInviteFragment } from './prototype-invite.js';

const LOCALE_RESTORE_KEY = 'creatorverse-locale-restore';
let restoredFocusApplied = false;
let freshCompletionPending = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function districtArtwork() {
  return `
    <svg class="district-artwork" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <path class="district-contour" d="M13 18 34 8l18 8 20-5 12 15-6 28-24 10-23-6-18-17Z"/>
      <path class="district-seam" d="M52 16v18l-9 8v16"/>
      <path class="district-beacon" d="M61 43V27m-7 6h14m-11-9 4-5 4 5"/>
    </svg>
  `;
}

function lockedMarkup(copy) {
  return `
    <div class="district-progress" data-district-progress data-district-state="locked" role="progressbar" aria-label="${escapeHtml(copy.progressLabel)}" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0" translate="no">
      ${districtArtwork()}
      <div class="district-progress-copy">
        <strong>${escapeHtml(copy.districtName)}</strong>
        <p class="district-progress-status"><bdi>${escapeHtml(copy.lockedStatus)}</bdi></p>
      </div>
    </div>
  `;
}

function hasValidInvite() {
  return parsePrototypeInviteFragment(window.location.hash).status === 'valid';
}

function decorateFollowerRealm(copy) {
  if (!hasValidInvite()) return;
  const card = document.querySelector('.realm-card');
  if (!card) return;
  const unlocked = Boolean(document.querySelector('[data-mission-result]'));
  const key = `${getLocale()}:${unlocked ? 'unlocked' : 'locked'}`;
  if (card.dataset.districtRealmKey === key) return;
  card.dataset.districtRealmKey = key;
  card.dataset.districtState = unlocked ? 'unlocked' : 'locked';
  card.setAttribute('translate', 'no');

  const progressLabel = card.querySelector('.progress-label');
  const name = progressLabel?.querySelector('span');
  const value = progressLabel?.querySelector('strong');
  if (name) name.textContent = copy.districtName;
  if (value) value.textContent = unlocked ? copy.unlockedValue : copy.lockedValue;

  const progress = card.querySelector('.progress');
  if (progress) {
    progress.setAttribute('aria-label', copy.progressLabel);
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '3');
    progress.setAttribute('aria-valuenow', unlocked ? '3' : '0');
    const fill = progress.querySelector('span');
    if (fill) fill.style.inlineSize = unlocked ? '100%' : '0%';
  }

  const map = card.querySelector('.signal-map');
  if (map) map.setAttribute('aria-label', copy.districtName);
  const districtCount = card.querySelector('.realm-stats > div:nth-child(2) dd');
  if (districtCount) districtCount.textContent = '1';
}

function decorateLockedMission(copy) {
  if (document.querySelector('[data-mission-result]')) return;
  const mission = document.querySelector('.mission');
  const heading = mission?.querySelector('.mission-heading');
  if (!mission || !heading) return;

  const existing = mission.querySelector('[data-district-progress]');
  const key = `${getLocale()}:locked`;
  if (existing?.dataset.districtCopyKey === key) return;
  existing?.remove();
  heading.insertAdjacentHTML('afterend', lockedMarkup(copy));
  const inserted = mission.querySelector('[data-district-progress]');
  if (inserted) inserted.dataset.districtCopyKey = key;
}

function restoreResultFocus(title) {
  if (restoredFocusApplied || !title || sessionStorage.getItem(LOCALE_RESTORE_KEY) === null) return;
  restoredFocusApplied = true;
  queueMicrotask(() => title.focus({ preventScroll: true }));
}

function decorateUnlockedResult(copy) {
  const result = document.querySelector('[data-mission-result]');
  if (!result) return;
  const key = `${getLocale()}:unlocked`;
  const title = result.querySelector('#mission-result-title');
  if (result.dataset.districtCopyKey === key) {
    restoreResultFocus(title);
    return;
  }

  result.dataset.districtResult = '';
  result.dataset.districtCopyKey = key;
  result.setAttribute('translate', 'no');
  if (title) title.textContent = copy.unlockedTitle;
  const support = result.querySelector('.district-unlock-support');
  if (support) support.textContent = copy.unlockedSupport;
  const progress = result.querySelector('[data-district-progress]');
  if (progress) {
    progress.setAttribute('aria-label', copy.progressLabel);
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '3');
    progress.setAttribute('aria-valuenow', '3');
    const name = progress.querySelector('.district-progress-copy strong');
    const status = progress.querySelector('.district-progress-status');
    if (name) name.textContent = copy.districtName;
    if (status) status.textContent = copy.unlockedStatus;
  }
  restoreResultFocus(title);
}

function applyFreshCompletion(copy) {
  const result = document.querySelector('[data-mission-result]');
  if (!freshCompletionPending || !result) return;
  freshCompletionPending = false;
  result.querySelector('[data-district-progress]')?.classList.remove('is-restored');
  const title = result.querySelector('#mission-result-title');
  const announcement = result.querySelector('[data-result-announcement]');
  queueMicrotask(() => {
    title?.focus({ preventScroll: true });
    if (!announcement) return;
    announcement.textContent = copy.announcement;
    setTimeout(() => {
      if (announcement.isConnected) announcement.textContent = '';
    }, 1200);
  });
}

function markFreshCompletion(event) {
  const action = event.target.closest?.('[data-mission-command]');
  if (!action || action.disabled || action.closest('[data-mission-legacy-triggers]')) return;
  if (!document.querySelector('[data-mission-result]')) freshCompletionPending = true;
}

let applying = false;
function applyDistrictView() {
  if (applying) return;
  applying = true;
  try {
    const copy = getDistrictProgressCopy(getLocale());
    decorateUnlockedResult(copy);
    decorateLockedMission(copy);
    decorateFollowerRealm(copy);
    applyFreshCompletion(copy);
  } finally {
    applying = false;
  }
}

document.addEventListener('click', markFreshCompletion, true);

const app = document.querySelector('#app');
if (app) {
  new MutationObserver(() => queueMicrotask(applyDistrictView)).observe(app, {
    childList: true,
    subtree: true,
  });
}

applyDistrictView();
