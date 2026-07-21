import { getLocale } from './i18n.js';
import { getSingleCreatorRealm } from './creator-ledger.js';
import {
  compareBeaconDistrictGrowth,
  deriveBeaconDistrictGrowth,
} from './beacon-district-growth.js';
import {
  formatBeaconDistrictGrowthAnnouncement,
  renderBeaconDistrictGrowth,
} from './beacon-district-growth-view.js';
import { getRealmContinuationCopy } from './realm-continuation-i18n.js';

let applying = false;
let scheduled = false;
let previousGrowth = currentGrowth();
let pendingChange = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function currentRealm() {
  const single = getSingleCreatorRealm(localStorage);
  return single.status === 'ready' ? single.realm : null;
}

function currentGrowth() {
  const realm = currentRealm();
  return realm ? deriveBeaconDistrictGrowth(realm) : Object.freeze({ status: 'unavailable' });
}

function detectChange(nextGrowth) {
  if (
    previousGrowth?.status === 'ready'
    && nextGrowth?.status === 'ready'
    && nextGrowth.totalEnergy === previousGrowth.totalEnergy + 3
  ) {
    const comparison = compareBeaconDistrictGrowth(previousGrowth, nextGrowth);
    if (comparison.status === 'ready') pendingChange = comparison;
  }
  previousGrowth = nextGrowth;
}

function replaceGrowth(host, markup, key) {
  const existing = host.querySelector(':scope > [data-beacon-district-growth]');
  if (existing?.dataset.enhancementKey === key) return existing;
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  next.dataset.enhancementKey = key;
  if (existing) existing.replaceWith(next);
  else host.prepend(next);
  return next;
}

function enhanceRealmUpdate(realm, growth, locale) {
  const section = document.querySelector('[data-creator-realm-update]');
  if (!section || growth.status !== 'ready') return null;
  const key = `${locale}:${growth.stageId}:${growth.totalEnergy}:${section.dataset.updateState || ''}`;
  const markup = renderBeaconDistrictGrowth(realm, {
    locale,
    headingId: 'creator-realm-update-title',
    headingLevel: 2,
    transition: Boolean(pendingChange),
  });
  if (!markup) return null;

  section.querySelector('.creator-realm-update-seal')?.remove();
  section.querySelector('.creator-realm-update-copy')?.remove();
  const surface = replaceGrowth(section, markup, key);
  section.classList.add('has-beacon-growth');
  const action = section.querySelector('[data-action="creator-realm-update-action"]');
  action?.classList.remove('primary');
  action?.classList.add('secondary');
  return surface;
}

function enhanceContinuation(realm, growth, locale) {
  if (growth.status !== 'ready') return;
  document.querySelectorAll('[data-realm-continuation] .realm-continuation-context').forEach(context => {
    const key = `${locale}:${realm.id}:${growth.stageId}:${growth.totalEnergy}`;
    if (context.dataset.beaconEnhancementKey === key) return;
    const copy = getRealmContinuationCopy(locale);
    context.dataset.beaconEnhancementKey = key;
    context.setAttribute('data-beacon-enhanced', '');
    context.innerHTML = `
      <div class="realm-continuation-realm">
        <p class="section-kicker">${escapeHtml(copy.kicker)}</p>
        <strong><bdi>${escapeHtml(realm.name)}</bdi></strong>
      </div>
      ${renderBeaconDistrictGrowth(realm, {
        locale,
        headingId: 'realm-continuation-district-title',
        headingLevel: 3,
        compact: true,
      })}
    `;
  });
}

function announceChange(surface, growth, locale) {
  if (!pendingChange || !surface) return;
  const live = document.querySelector('[data-completion-announcement]');
  if (!live) return;
  const stageChanged = pendingChange.advanced;
  live.textContent = formatBeaconDistrictGrowthAnnouncement(growth, { locale, stageChanged });
  surface.classList.add('is-transitioning');
  if (stageChanged) {
    requestAnimationFrame(() => {
      surface.querySelector('#creator-realm-update-title')?.focus({ preventScroll: true });
    });
  }
  pendingChange = null;
}

function applyEnhancement() {
  if (applying) return;
  applying = true;
  try {
    const realm = currentRealm();
    const growth = realm ? deriveBeaconDistrictGrowth(realm) : Object.freeze({ status: 'unavailable' });
    detectChange(growth);
    if (!realm || growth.status !== 'ready') return;
    const locale = getLocale();
    const surface = enhanceRealmUpdate(realm, growth, locale);
    enhanceContinuation(realm, growth, locale);
    announceChange(surface, growth, locale);
  } finally {
    applying = false;
  }
}

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyEnhancement();
  });
}

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(app, { childList: true, subtree: true });
}
window.addEventListener('hashchange', scheduleEnhancement);
window.addEventListener('storage', scheduleEnhancement);
document.addEventListener('click', event => {
  if (event.target.closest?.('[data-action="import-completion-receipt"], [data-action="retry-completion-receipt"]')) {
    requestAnimationFrame(scheduleEnhancement);
  }
});

scheduleEnhancement();
