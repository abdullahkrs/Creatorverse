import { getLocale } from './i18n.js';
import { getDistrictProgressCopy } from './district-progress-i18n.js';

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

function decorateUnlockedResult(copy) {
  const result = document.querySelector('[data-mission-result]');
  if (!result) return;
  const key = `${getLocale()}:unlocked`;
  if (result.dataset.districtCopyKey === key) return;

  result.dataset.districtResult = '';
  result.dataset.districtCopyKey = key;
  result.setAttribute('translate', 'no');
  const title = result.querySelector('#mission-result-title');
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
}

let applying = false;
function applyDistrictView() {
  if (applying) return;
  applying = true;
  try {
    const copy = getDistrictProgressCopy(getLocale());
    decorateUnlockedResult(copy);
    decorateLockedMission(copy);
  } finally {
    applying = false;
  }
}

const app = document.querySelector('#app');
if (app) {
  new MutationObserver(() => queueMicrotask(applyDistrictView)).observe(app, {
    childList: true,
    subtree: true,
  });
}

applyDistrictView();
