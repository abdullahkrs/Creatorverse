import { getLocale } from './i18n.js';
import { getSingleCreatorRealm } from './creator-ledger.js';
import { deriveRealmChronicle, REALM_CHRONICLE_RECENT_LIMIT } from './realm-chronicle.js';
import { formatRealmChronicleAnnouncement, renderRealmChronicle } from './realm-chronicle-view.js';

let applying = false;
let scheduled = false;
let expanded = false;
let pendingAnnouncement = '';
let restoreToggleFocus = false;

function replaceChronicle(section, markup, key) {
  const existing = section.querySelector(':scope > [data-realm-chronicle]');
  if (existing?.dataset.enhancementKey === key) return existing;
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  next.dataset.enhancementKey = key;
  if (existing) existing.replaceWith(next);
  else section.append(next);
  return next;
}

function clearChronicle() {
  document.querySelectorAll('[data-realm-chronicle]').forEach(element => element.remove());
  expanded = false;
  pendingAnnouncement = '';
  restoreToggleFocus = false;
}

function applyEnhancement() {
  if (applying) return;
  applying = true;
  try {
    const section = document.querySelector('[data-realm-continuation][data-state="ready"]');
    const single = getSingleCreatorRealm(localStorage);
    if (!section || single.status !== 'ready') {
      clearChronicle();
      return;
    }

    section.setAttribute('aria-busy', 'true');
    const locale = getLocale();
    const chronicle = deriveRealmChronicle(single.realm);
    if (chronicle.status !== 'ready') {
      clearChronicle();
      section.setAttribute('aria-busy', 'false');
      return;
    }
    if (chronicle.contributionCount <= REALM_CHRONICLE_RECENT_LIMIT) expanded = false;

    const key = `${locale}:${chronicle.contributionCount}:${chronicle.totalEnergy}:${expanded}`;
    const markup = renderRealmChronicle(single.realm, { locale, expanded });
    const surface = replaceChronicle(section, markup, key);
    section.setAttribute('aria-busy', 'false');

    if (pendingAnnouncement) {
      surface.querySelector('[data-realm-chronicle-live]').textContent = pendingAnnouncement;
      pendingAnnouncement = '';
    }
    if (restoreToggleFocus) {
      restoreToggleFocus = false;
      queueMicrotask(() => surface.querySelector('[data-action="toggle-realm-chronicle"]')?.focus({ preventScroll: true }));
    }
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

function toggleChronicle() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const chronicle = deriveRealmChronicle(single.realm);
  if (chronicle.status !== 'ready' || chronicle.contributionCount <= REALM_CHRONICLE_RECENT_LIMIT) return;
  expanded = !expanded;
  pendingAnnouncement = formatRealmChronicleAnnouncement({
    expanded,
    count: expanded ? chronicle.contributionCount : REALM_CHRONICLE_RECENT_LIMIT,
  }, getLocale());
  restoreToggleFocus = true;
  scheduleEnhancement();
}

document.addEventListener('click', event => {
  if (event.target.closest?.('[data-action="toggle-realm-chronicle"]')) toggleChronicle();
});
window.addEventListener('hashchange', scheduleEnhancement);
window.addEventListener('storage', scheduleEnhancement);
const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(app, { childList: true, subtree: true });
}
scheduleEnhancement();
