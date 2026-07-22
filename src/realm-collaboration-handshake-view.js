import { getRealmCollaborationCopy } from './realm-collaboration-i18n.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function signalArtwork(state) {
  return `
    <svg class="realm-handshake-signal" data-handshake-signal="${escapeHtml(state)}" viewBox="0 0 260 80" aria-hidden="true" focusable="false">
      <g class="realm-handshake-terminal realm-handshake-terminal-source">
        <path d="M18 40 38 18l24 10v24L38 62Z"/>
        <circle cx="40" cy="40" r="5"/>
      </g>
      <path class="realm-handshake-circuit realm-handshake-circuit-first" d="M66 40h48l12-12h28"/>
      <path class="realm-handshake-circuit realm-handshake-circuit-last" d="M154 28h24l12 12h4"/>
      <circle class="realm-handshake-junction" cx="140" cy="28" r="7"/>
      <g class="realm-handshake-terminal realm-handshake-terminal-accepting">
        <path d="m198 28 24-10 20 22-20 22-24-10Z"/>
        <circle cx="220" cy="40" r="5"/>
      </g>
    </svg>
  `;
}

function realmIdentity(label, realm, copy) {
  return `
    <div class="realm-handshake-realm">
      <span>${escapeHtml(label)}</span>
      <strong><bdi>${escapeHtml(realm.name)}</bdi></strong>
      <small>${escapeHtml(copy[realm.theme])}</small>
    </div>
  `;
}

function heading(kicker, title, support, close = '') {
  return `
    <div class="realm-collaboration-heading">
      <div>
        <p class="section-kicker">${escapeHtml(kicker)}</p>
        <h3 id="realm-handshake-title" tabindex="-1">${escapeHtml(title)}</h3>
        <p>${escapeHtml(support)}</p>
      </div>
      ${close ? `<button class="secondary" type="button" data-action="close-realm-collaboration">${escapeHtml(close)}</button>` : ''}
    </div>
  `;
}

function status(message = '') {
  return `<p class="realm-collaboration-status" data-handshake-live aria-live="polite" aria-atomic="true">${escapeHtml(message)}</p>`;
}

export function renderPendingHandshake({ locale, realm, action, message = '', discardOpen = false, manualUrl = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  return `
    <section class="realm-collaboration realm-collaboration-handshake is-pending" data-realm-collaboration data-state="pending-awaiting-confirmation" aria-labelledby="realm-handshake-title">
      ${heading(copy.relationshipLabel, copy.pendingTitle, copy.pendingSupport, copy.close)}
      <div class="realm-handshake-origin">
        ${realmIdentity(copy.yourRealmLabel, realm, copy)}
        ${signalArtwork('pending')}
      </div>
      <div class="realm-handshake-actions">
        <button class="secondary" type="button" data-action="resume-realm-collaboration" ${action.disabled ? 'disabled aria-busy="true"' : ''}>${escapeHtml(action.label)}</button>
        <button class="secondary" type="button" data-action="discard-pending-realm-collaboration">${escapeHtml(copy.discard)}</button>
      </div>
      ${manualUrl ? `<label class="realm-collaboration-manual"><span>${escapeHtml(copy.manual)}</span><input readonly dir="ltr" value="${escapeHtml(manualUrl)}"></label>` : ''}
      ${discardOpen ? `
        <div class="realm-collaboration-confirm" role="dialog" aria-modal="true" aria-labelledby="realm-handshake-discard-title" aria-describedby="realm-handshake-discard-support">
          <h4 id="realm-handshake-discard-title">${escapeHtml(copy.discardTitle)}</h4>
          <p id="realm-handshake-discard-support">${escapeHtml(copy.discardSupport)}</p>
          <div>
            <button class="secondary" type="button" data-action="keep-pending-realm-collaboration">${escapeHtml(copy.keep)}</button>
            <button class="secondary" type="button" data-action="confirm-discard-pending-realm-collaboration">${escapeHtml(copy.confirmDiscard)}</button>
          </div>
        </div>
      ` : ''}
      ${status(message)}
    </section>
  `;
}

export function renderHandshakeReady({ locale, realm, message = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  return `
    <section class="realm-collaboration realm-collaboration-handshake" data-realm-collaboration data-state="proposal-ready" aria-labelledby="realm-handshake-title">
      ${heading(copy.relationshipLabel, copy.title, copy.support, copy.close)}
      <div class="realm-handshake-origin">
        ${realmIdentity(copy.yourRealmLabel, realm, copy)}
        ${signalArtwork('open')}
      </div>
      <div class="realm-handshake-actions">
        <button class="secondary" type="button" data-action="create-realm-collaboration">${escapeHtml(copy.create)}</button>
      </div>
      ${status(message)}
    </section>
  `;
}

export function renderConfirmationPreview({ locale, local, accepting, confirming = false, message = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  return `
    <section class="realm-collaboration realm-collaboration-handshake is-confirmation" data-realm-collaboration data-state="confirmation-preview" aria-labelledby="realm-handshake-title">
      ${heading(copy.relationshipLabel, copy.completeTitle, copy.completeSupport, copy.close)}
      <div class="realm-handshake-identities">
        ${realmIdentity(copy.yourRealmLabel, local, copy)}
        ${signalArtwork('confirmation')}
        ${realmIdentity(copy.acceptingRealmLabel, accepting, copy)}
      </div>
      <div class="realm-handshake-actions">
        <button class="secondary" type="button" data-action="confirm-realm-collaboration-handshake" ${confirming ? 'disabled aria-busy="true"' : ''}>${escapeHtml(confirming ? copy.confirmingLink : copy.confirmLink)}</button>
        <button class="secondary" type="button" data-action="cancel-realm-collaboration-handshake">${escapeHtml(copy.close)}</button>
      </div>
      ${status(message)}
    </section>
  `;
}

export function renderHandshakeSuccess({ locale, local, accepting, message = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  return `
    <section class="realm-collaboration realm-collaboration-handshake is-success" data-realm-collaboration data-state="reciprocal-success" aria-labelledby="realm-handshake-title">
      ${heading(copy.relationshipLabel, copy.confirmedTitle, copy.confirmedSupport)}
      <div class="realm-handshake-identities">
        ${realmIdentity(copy.yourRealmLabel, local, copy)}
        ${signalArtwork('linked')}
        ${realmIdentity(copy.acceptingRealmLabel, accepting, copy)}
      </div>
      <div class="realm-handshake-actions">
        <button class="secondary" type="button" data-action="finish-realm-collaboration-handshake">${escapeHtml(copy.returnToRealm)}</button>
      </div>
      ${status(message)}
    </section>
  `;
}

export function renderHandshakeError({ locale, kind, message = '', hasPending = false }) {
  const copy = getRealmCollaborationCopy(locale);
  const content = {
    invalid: [copy.invalidConfirmationTitle, copy.invalidConfirmationSupport],
    mismatch: [copy.mismatchTitle, copy.mismatchSupport],
    'no-pending': [copy.noPendingTitle, copy.noPendingSupport],
    'already-linked': [copy.alreadyTitle, copy.alreadySupport],
    storage: [copy.storageTitle, copy.storageSupport],
  }[kind] || [copy.invalidConfirmationTitle, copy.invalidConfirmationSupport];
  const action = hasPending
    ? [copy.resume, 'resume-matching-realm-collaboration']
    : [copy.returnToRealm, 'cancel-realm-collaboration-handshake'];
  return `
    <section class="realm-collaboration realm-collaboration-handshake is-error" data-realm-collaboration data-state="${escapeHtml(kind)}" aria-labelledby="realm-handshake-title">
      ${heading(copy.relationshipLabel, content[0], content[1])}
      <div class="realm-handshake-actions">
        <button class="secondary" type="button" data-action="${escapeHtml(action[1])}">${escapeHtml(action[0])}</button>
      </div>
      ${status(message)}
    </section>
  `;
}

export function renderReturnConfirmationControl({ locale, action, message = '', manualUrl = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  return `
    <div class="realm-handshake-return" data-handshake-return>
      <button class="secondary" type="button" data-action="return-realm-collaboration-confirmation" ${action.disabled ? 'disabled aria-busy="true"' : ''}>${escapeHtml(action.label)}</button>
      ${manualUrl ? `<label class="realm-collaboration-manual"><span>${escapeHtml(copy.confirmationManual)}</span><input readonly dir="ltr" value="${escapeHtml(manualUrl)}"></label>` : ''}
      ${status(message)}
    </div>
  `;
}
