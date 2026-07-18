import { getLocale } from './i18n.js';
import { getPrototypeInviteCopy } from './prototype-invite-i18n.js';
import {
  PROTOTYPE_INVITE_RECEIPT_KEY,
  buildPrototypeInviteUrl,
  createPrototypeInvite,
  parsePrototypeInviteFragment,
  parsePrototypeInviteToken,
  serializePrototypeInvite,
} from './prototype-invite.js';

const RECEIPT_FOCUS_KEY = `${PROTOTYPE_INVITE_RECEIPT_KEY}:focus`;
const THEME_PATHS = Object.freeze({
  cosmic: '<path d="M5 17h3V7H5v10Zm5 0h4V4h-4v13Zm6 0h3V10h-3v7Z"/>',
  wild: '<path d="M12 3c3 0 5 2.1 5 4.8 2 .4 3 1.9 3 3.7 0 2.5-2 4.5-4.5 4.5H14v5h-4v-5H8.5A4.5 4.5 0 0 1 4 11.5c0-1.8 1-3.3 3-3.7C7 5.1 9 3 12 3Z"/>',
  future: '<path d="M7 3h4v4H9v3h6V7h-2V3h4v4h-1v4h4v4h-4v-2H9v2H8v3h3v-1h4v4h-4v-1H6v-5H4v-4h3V7H7V3Z"/>',
});

let creatorDraft = {
  realmName: 'Nova Guild',
  theme: 'cosmic',
  communityPromise: 'A community built around bold ideas.',
};
let applying = false;

function copy() {
  return getPrototypeInviteCopy(getLocale());
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function themeIcon(theme, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `cv-icon ${className}`.trim());
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = THEME_PATHS[theme] || THEME_PATHS.cosmic;
  return svg;
}

function appendBdi(parent, value) {
  const bdi = document.createElement('bdi');
  bdi.dir = 'auto';
  bdi.textContent = value;
  parent.append(bdi);
  return bdi;
}

function setManagedHidden(node, hidden) {
  if (!node) return;
  if (hidden) {
    node.hidden = true;
    node.dataset.prototypeInviteHidden = 'true';
  } else if (node.dataset.prototypeInviteHidden === 'true') {
    node.hidden = false;
    delete node.dataset.prototypeInviteHidden;
  }
}

function captureCreatorDraft() {
  const name = document.querySelector('[data-field="name"]');
  const promise = document.querySelector('[data-field="tagline"]');
  const selectedTheme = document.querySelector('[data-theme][aria-checked="true"], [data-theme].selected');
  if (name) creatorDraft.realmName = name.value;
  if (promise) creatorDraft.communityPromise = promise.value;
  if (selectedTheme?.dataset.theme) creatorDraft.theme = selectedTheme.dataset.theme;
}

function getReceipt() {
  const token = sessionStorage.getItem(PROTOTYPE_INVITE_RECEIPT_KEY);
  if (!token) return null;
  const parsed = parsePrototypeInviteToken(token);
  if (parsed.status !== 'valid') {
    sessionStorage.removeItem(PROTOTYPE_INVITE_RECEIPT_KEY);
    sessionStorage.removeItem(RECEIPT_FOCUS_KEY);
    return null;
  }
  return { token, invite: parsed.invite };
}

function createCloseButton(existingClose, labels) {
  if (existingClose) {
    existingClose.setAttribute('aria-label', labels.closeReceipt);
    return existingClose;
  }
  const button = element('button', 'icon-button prototype-invite-close');
  button.type = 'button';
  button.dataset.inviteAction = 'close-receipt';
  button.setAttribute('aria-label', labels.closeReceipt);
  button.append(themeIcon('cosmic'));
  return button;
}

function ensureReceiptStudio() {
  let studio = document.querySelector('#creator-studio');
  if (studio) return studio;

  studio = element('section', 'creator-studio shell');
  studio.id = 'creator-studio';
  const tools = document.querySelector('.creator-tools');
  if (tools) tools.before(studio);
  else document.querySelector('main')?.append(studio);
  return studio;
}

function renderCreatorReceipt(receipt) {
  const labels = copy();
  const studio = ensureReceiptStudio();
  if (studio.dataset.prototypeInviteToken === receipt.token) return;

  const existingClose = studio.querySelector('[data-action="close-creator"]');
  studio.replaceChildren();
  studio.classList.add('prototype-invite-studio');
  studio.dataset.prototypeInviteReceipt = 'true';
  studio.dataset.prototypeInviteToken = receipt.token;
  studio.setAttribute('aria-labelledby', 'prototype-invite-receipt-title');

  const header = element('header', 'studio-heading prototype-invite-heading');
  const headingCopy = element('div');
  const kicker = element('p', 'section-kicker', labels.invitedRealm);
  const title = element('h2', '', labels.receiptTitle);
  title.id = 'prototype-invite-receipt-title';
  headingCopy.append(kicker, title);
  header.append(headingCopy, createCloseButton(existingClose, labels));

  const layout = element('div', 'prototype-invite-receipt-layout');
  const copyPanel = element('div', 'prototype-invite-copy-panel');
  const support = element('p', 'prototype-invite-support', labels.receiptSupport);
  const button = element('button', 'primary prototype-invite-copy', labels.copyInvite);
  button.type = 'button';
  button.dataset.inviteAction = 'copy';
  button.dataset.inviteUrl = buildPrototypeInviteUrl(window.location, receipt.token);
  button.setAttribute('aria-describedby', 'prototype-invite-copy-status');

  const status = element('p', 'prototype-invite-status');
  status.id = 'prototype-invite-copy-status';
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  const fallback = element('div', 'prototype-invite-url');
  fallback.hidden = true;
  fallback.dataset.inviteFallback = 'true';
  const fallbackLabel = element('label', 'cv-visually-hidden', labels.inviteUrlLabel);
  fallbackLabel.htmlFor = 'prototype-invite-url-field';
  const field = document.createElement('input');
  field.id = 'prototype-invite-url-field';
  field.type = 'text';
  field.readOnly = true;
  field.dir = 'ltr';
  field.value = button.dataset.inviteUrl;
  fallback.append(fallbackLabel, field);

  const announcement = element('p', 'cv-visually-hidden');
  announcement.dataset.inviteAnnouncement = 'true';
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');

  copyPanel.append(support, button, status, fallback, announcement);

  const stamp = element('aside', `prototype-invite-stamp theme-${receipt.invite.theme}`);
  stamp.setAttribute('aria-label', `${labels.themes[receipt.invite.theme]} · ${receipt.invite.realmName}`);
  const rail = element('span', 'prototype-invite-rail');
  const stampIcon = themeIcon(receipt.invite.theme, 'prototype-invite-theme-icon');
  const stampCopy = element('span', 'prototype-invite-stamp-copy');
  const realmName = element('strong');
  appendBdi(realmName, receipt.invite.realmName);
  const themeLabel = element('small', '', labels.themes[receipt.invite.theme]);
  stampCopy.append(realmName, themeLabel);
  stamp.append(rail, stampIcon, stampCopy);

  layout.append(copyPanel, stamp);
  studio.append(header, layout);

  if (sessionStorage.getItem(RECEIPT_FOCUS_KEY) === 'true') {
    sessionStorage.removeItem(RECEIPT_FOCUS_KEY);
    requestAnimationFrame(() => {
      button.focus({ preventScroll: true });
      announcement.textContent = labels.receiptReady;
      window.setTimeout(() => { announcement.textContent = ''; }, 1200);
    });
  }
}

function applyInviteRealmToCard(invite, labels) {
  const card = document.querySelector('.realm-card');
  if (!card || card.dataset.prototypeInviteRealm === invite.realmName) return;

  card.dataset.prototypeInviteRealm = invite.realmName;
  card.classList.remove('theme-cosmic', 'theme-wild', 'theme-future');
  card.classList.add(`theme-${invite.theme}`);

  const title = card.querySelector('.realm-heading h2');
  if (title) {
    title.replaceChildren();
    appendBdi(title, invite.realmName);
  }
  const creator = card.querySelector('.realm-creator');
  if (creator) creator.hidden = true;
  const tagline = card.querySelector('.realm-tagline');
  if (tagline) {
    tagline.replaceChildren();
    appendBdi(tagline, invite.communityPromise || labels.defaultPromises[invite.theme]);
  }
  const kicker = card.querySelector('.section-kicker');
  if (kicker) kicker.textContent = labels.invitedRealm;
  const map = card.querySelector('.signal-map');
  if (map) map.setAttribute('aria-label', `${invite.realmName} ${labels.realmMapSuffix}`);
}

function renderFollowerEntry(invite) {
  const labels = copy();
  const intro = document.querySelector('.experience-intro');
  if (!intro) return;
  const marker = `${window.location.hash}:${getLocale()}`;
  if (intro.dataset.prototypeInviteEntry !== marker) {
    intro.replaceChildren();
    intro.classList.add('prototype-invite-entry');
    intro.dataset.prototypeInviteEntry = marker;

    const title = element('h1');
    title.id = 'experience-title';
    title.append(document.createTextNode(`${labels.welcomePrefix} `));
    appendBdi(title, invite.realmName);

    const facts = element('div', 'prototype-invite-facts');
    const themeFact = element('span', 'prototype-invite-fact');
    themeFact.append(themeIcon(invite.theme), document.createTextNode(labels.themes[invite.theme]));
    const creatorFact = element('span', 'prototype-invite-fact');
    creatorFact.append(themeIcon('cosmic'), document.createTextNode(labels.realmCreator));
    facts.append(themeFact, creatorFact);

    const promise = element('p', 'prototype-invite-promise');
    appendBdi(promise, invite.communityPromise || labels.defaultPromises[invite.theme]);
    intro.append(title, facts, promise);
  }

  applyInviteRealmToCard(invite, labels);
  const completed = Boolean(document.querySelector('[data-mission-result]'));
  setManagedHidden(document.querySelector('.nav-create'), !completed);
  setManagedHidden(document.querySelector('.creator-tools'), !completed);
}

function renderInvalidInvite() {
  const labels = copy();
  const experience = document.querySelector('.experience');
  if (!experience || experience.dataset.prototypeInviteInvalid === window.location.hash) return;

  experience.dataset.prototypeInviteInvalid = window.location.hash;
  experience.replaceChildren();
  const panel = element('section', 'prototype-invite-error');
  panel.dataset.prototypeInviteInvalid = 'true';
  panel.setAttribute('aria-labelledby', 'prototype-invite-error-title');
  const title = element('h1', '', labels.invalidTitle);
  title.id = 'prototype-invite-error-title';
  title.tabIndex = -1;
  const message = element('p', '', labels.invalidMessage);
  const action = element('button', 'primary', labels.recoveryAction);
  action.type = 'button';
  action.dataset.inviteAction = 'recover';
  panel.append(title, message, action);
  experience.append(panel);

  setManagedHidden(document.querySelector('.nav-create'), true);
  setManagedHidden(document.querySelector('.creator-tools'), true);
  requestAnimationFrame(() => title.focus({ preventScroll: true }));
}

function restoreNormalChrome() {
  setManagedHidden(document.querySelector('.nav-create'), false);
  setManagedHidden(document.querySelector('.creator-tools'), false);
  document.body.classList.remove('prototype-invite-mode', 'prototype-invite-invalid-mode');
}

function enhance() {
  if (applying) return;
  applying = true;
  captureCreatorDraft();

  const fragment = parsePrototypeInviteFragment(window.location.hash);
  if (fragment.status === 'valid') {
    document.body.classList.add('prototype-invite-mode');
    document.body.classList.remove('prototype-invite-invalid-mode');
    renderFollowerEntry(fragment.invite);
  } else if (fragment.status === 'invalid') {
    document.body.classList.add('prototype-invite-mode', 'prototype-invite-invalid-mode');
    renderInvalidInvite();
  } else {
    const receipt = getReceipt();
    if (receipt) {
      document.body.classList.remove('prototype-invite-mode', 'prototype-invite-invalid-mode');
      renderCreatorReceipt(receipt);
      applyInviteRealmToCard(receipt.invite, copy());
      setManagedHidden(document.querySelector('.nav-create'), true);
      setManagedHidden(document.querySelector('.creator-tools'), true);
    } else {
      restoreNormalChrome();
    }
  }

  applying = false;
}

async function copyInvite(button) {
  const labels = copy();
  const studio = button.closest('[data-prototype-invite-receipt]');
  const status = studio?.querySelector('#prototype-invite-copy-status');
  const fallback = studio?.querySelector('[data-invite-fallback]');
  const field = fallback?.querySelector('input');
  if (!status || !fallback || !field) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = labels.copying;
  status.textContent = '';

  try {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      const unsupported = new Error('COPY_UNAVAILABLE');
      unsupported.name = 'NotSupportedError';
      throw unsupported;
    }
    await navigator.clipboard.writeText(button.dataset.inviteUrl);
    fallback.hidden = true;
    button.textContent = labels.copied;
    status.textContent = labels.copiedStatus;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.focus({ preventScroll: true });
  } catch (error) {
    const unavailable = ['NotAllowedError', 'NotSupportedError', 'SecurityError'].includes(error?.name);
    fallback.hidden = false;
    field.value = button.dataset.inviteUrl;
    button.textContent = labels.tryAgain;
    status.textContent = unavailable ? labels.copyUnavailable : labels.copyFailed;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    field.focus({ preventScroll: true });
    field.select();
  }
}

function showUnsafeInputError() {
  const message = document.querySelector('.creator-studio .form-message');
  if (!message) return;
  message.textContent = copy().unsafeInput;
  message.tabIndex = -1;
  message.setAttribute('aria-live', 'assertive');
  message.focus({ preventScroll: true });
}

function clearReceipt() {
  sessionStorage.removeItem(PROTOTYPE_INVITE_RECEIPT_KEY);
  sessionStorage.removeItem(RECEIPT_FOCUS_KEY);
}

document.addEventListener('input', event => {
  const field = event.target.closest?.('[data-field="name"], [data-field="tagline"]');
  if (!field) return;
  if (field.dataset.field === 'name') creatorDraft.realmName = field.value;
  if (field.dataset.field === 'tagline') creatorDraft.communityPromise = field.value;
}, true);

document.addEventListener('click', event => {
  const theme = event.target.closest?.('[data-theme]');
  if (theme?.dataset.theme) creatorDraft.theme = theme.dataset.theme;

  const create = event.target.closest?.('[data-action="creator"]');
  if (create) clearReceipt();

  const close = event.target.closest?.('[data-action="close-creator"]');
  if (close && document.querySelector('[data-prototype-invite-receipt]')) clearReceipt();

  const launch = event.target.closest?.('[data-action="creator-next"]');
  const safety = document.querySelector('[data-field="safety"]');
  if (launch && safety) {
    captureCreatorDraft();
    try {
      const invite = createPrototypeInvite(creatorDraft);
      const token = serializePrototypeInvite(invite);
      event.preventDefault();
      event.stopImmediatePropagation();
      sessionStorage.setItem(PROTOTYPE_INVITE_RECEIPT_KEY, token);
      sessionStorage.setItem(RECEIPT_FOCUS_KEY, 'true');
      renderCreatorReceipt({ token, invite });
      applyInviteRealmToCard(invite, copy());
      setManagedHidden(document.querySelector('.nav-create'), true);
      setManagedHidden(document.querySelector('.creator-tools'), true);
    } catch {
      event.preventDefault();
      event.stopImmediatePropagation();
      showUnsafeInputError();
    }
    return;
  }

  const action = event.target.closest?.('[data-invite-action]');
  if (!action) return;
  if (action.dataset.inviteAction === 'copy') {
    event.preventDefault();
    copyInvite(action);
  }
  if (action.dataset.inviteAction === 'recover') {
    event.preventDefault();
    const base = new URL(window.location.href);
    base.search = '';
    base.hash = '';
    window.location.replace(base.toString());
  }
  if (action.dataset.inviteAction === 'close-receipt') {
    event.preventDefault();
    clearReceipt();
    action.closest('#creator-studio')?.remove();
    restoreNormalChrome();
  }
}, true);

window.addEventListener('hashchange', () => window.location.reload());

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(() => queueMicrotask(enhance));
  observer.observe(app, { childList: true, subtree: true });
}

enhance();
