import { getRealmCollaborationCopy } from './realm-collaboration-i18n.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function signalArtwork(state = 'proposal') {
  return `
    <svg class="realm-collaboration-signal" data-link-state="${escapeHtml(state)}" viewBox="0 0 240 76" aria-hidden="true" focusable="false">
      <g class="realm-collaboration-mark realm-collaboration-mark-source">
        <path d="M18 38 34 20l20 8v20l-20 8Z"/>
        <circle cx="34" cy="38" r="5"/>
      </g>
      <path class="realm-collaboration-connector" d="M58 38h124"/>
      <circle class="realm-collaboration-node" cx="120" cy="38" r="7"/>
      <g class="realm-collaboration-mark realm-collaboration-mark-local">
        <path d="m186 28 20-8 16 18-16 18-20-8Z"/>
        <circle cx="206" cy="38" r="5"/>
      </g>
    </svg>
  `;
}

function realmIdentity(label, realm, copy) {
  return `
    <div class="realm-collaboration-realm">
      <span>${escapeHtml(label)}</span>
      <strong><bdi>${escapeHtml(realm.name)}</bdi></strong>
      <small>${escapeHtml(copy[realm.theme])}</small>
    </div>
  `;
}

function identities(source, local, copy, state) {
  return `
    <div class="realm-collaboration-identities">
      ${realmIdentity(copy.sourceLabel, source, copy)}
      ${signalArtwork(state)}
      ${realmIdentity(copy.localLabel, local, copy)}
    </div>
  `;
}

function proposalOrigin(realm, copy, state) {
  return `
    <div class="realm-collaboration-identities" data-collaboration-origin-only>
      ${realmIdentity(copy.sourceLabel, realm, copy)}
      ${signalArtwork(state)}
    </div>
  `;
}

function statusLine(message = '') {
  return `<p class="realm-collaboration-status" data-collaboration-live aria-live="polite" aria-atomic="true">${escapeHtml(message)}</p>`;
}

export function renderCollaborationAction(locale, linked = false) {
  const copy = getRealmCollaborationCopy(locale);
  return `<button class="secondary realm-collaboration-open" type="button" data-action="open-realm-collaboration" aria-expanded="false">${escapeHtml(linked ? copy.linkedTitle : copy.action)}</button>`;
}

export function renderCollaborationReady({ locale, realm, proposal = null, action = {}, message = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  const hasProposal = Boolean(proposal?.url);
  const manual = ['denied', 'failed', 'unsupported'].includes(action.state);
  return `
    <section class="realm-collaboration" data-realm-collaboration data-state="${hasProposal ? 'proposal-ready' : 'ready'}" aria-labelledby="realm-collaboration-title">
      <div class="realm-collaboration-heading">
        <div>
          <p class="section-kicker">${escapeHtml(copy.relationshipLabel)}</p>
          <h3 id="realm-collaboration-title" tabindex="-1">${escapeHtml(copy.title)}</h3>
          <p>${escapeHtml(copy.support)}</p>
        </div>
        <button class="secondary" type="button" data-action="close-realm-collaboration">${escapeHtml(copy.close)}</button>
      </div>
      ${proposalOrigin(realm, copy, hasProposal ? 'proposal' : 'open')}
      <div class="realm-collaboration-actions">
        ${hasProposal
          ? `<button class="secondary" type="button" data-action="share-realm-collaboration" ${action.disabled ? 'disabled aria-busy="true"' : ''}>${escapeHtml(action.label)}</button>`
          : `<button class="secondary" type="button" data-action="create-realm-collaboration">${escapeHtml(copy.create)}</button>`}
      </div>
      ${manual ? `<label class="realm-collaboration-manual"><span>${escapeHtml(copy.manual)}</span><input readonly dir="ltr" value="${escapeHtml(proposal.url)}"></label>` : ''}
      ${statusLine(message)}
    </section>
  `;
}

export function renderCollaborationPreview({ locale, source, local, state = 'preview', message = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  const pending = state === 'accepting';
  return `
    <section class="realm-collaboration is-preview" data-realm-collaboration data-state="${escapeHtml(state)}" aria-labelledby="realm-collaboration-preview-title">
      <div class="realm-collaboration-heading">
        <div>
          <p class="section-kicker">${escapeHtml(copy.relationshipLabel)}</p>
          <h3 id="realm-collaboration-preview-title" tabindex="-1">${escapeHtml(copy.previewTitle)}</h3>
          <p>${escapeHtml(copy.previewSupport)}</p>
        </div>
        <button class="secondary" type="button" data-action="reject-realm-collaboration">${escapeHtml(copy.close)}</button>
      </div>
      ${identities(source, local, copy, 'proposal')}
      <div class="realm-collaboration-actions">
        <button class="secondary" type="button" data-action="accept-realm-collaboration" ${pending ? 'disabled aria-busy="true"' : ''}>${escapeHtml(pending ? copy.accepting : copy.accept)}</button>
      </div>
      ${statusLine(message)}
    </section>
  `;
}

export function renderCollaborationLinked({ locale, source, local, confirm = false, message = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  return `
    <section class="realm-collaboration is-linked" data-realm-collaboration data-state="${confirm ? 'removal-confirmation' : 'linked'}" aria-labelledby="realm-collaboration-linked-title">
      <div class="realm-collaboration-heading">
        <div>
          <p class="section-kicker">${escapeHtml(copy.relationshipLabel)}</p>
          <h3 id="realm-collaboration-linked-title" tabindex="-1">${escapeHtml(copy.linkedTitle)}</h3>
          <p>${escapeHtml(copy.linkedSupport)}</p>
        </div>
      </div>
      ${identities(source, local, copy, 'linked')}
      <div class="realm-collaboration-actions">
        <button class="secondary" type="button" data-action="remove-realm-collaboration">${escapeHtml(copy.remove)}</button>
      </div>
      ${confirm ? `
        <div class="realm-collaboration-confirm" role="dialog" aria-modal="true" aria-labelledby="realm-collaboration-confirm-title" aria-describedby="realm-collaboration-confirm-support">
          <h4 id="realm-collaboration-confirm-title">${escapeHtml(copy.confirmTitle)}</h4>
          <p id="realm-collaboration-confirm-support">${escapeHtml(copy.confirmSupport)}</p>
          <div>
            <button class="secondary" type="button" data-action="keep-realm-collaboration">${escapeHtml(copy.keep)}</button>
            <button class="secondary" type="button" data-action="confirm-remove-realm-collaboration">${escapeHtml(copy.confirmRemove)}</button>
          </div>
        </div>
      ` : ''}
      ${statusLine(message)}
    </section>
  `;
}

export function renderCollaborationError({ locale, kind, message = '' }) {
  const copy = getRealmCollaborationCopy(locale);
  const content = {
    invalid: [copy.invalidTitle, copy.invalidSupport, copy.back, 'reject-realm-collaboration'],
    self: [copy.selfTitle, copy.selfSupport, copy.back, 'reject-realm-collaboration'],
    already: [copy.alreadyTitle, copy.alreadySupport, copy.viewCurrent, 'view-current-realm-collaboration'],
    noRealm: [copy.noRealmTitle, copy.noRealmSupport, copy.createRealm, 'create-realm-from-collaboration'],
    storage: [copy.storageTitle, copy.storageSupport, copy.retry, 'retry-realm-collaboration'],
  }[kind] || [copy.invalidTitle, copy.invalidSupport, copy.back, 'reject-realm-collaboration'];
  return `
    <section class="realm-collaboration is-error" data-realm-collaboration data-state="${escapeHtml(kind)}" aria-labelledby="realm-collaboration-error-title">
      <div class="realm-collaboration-heading">
        <div>
          <p class="section-kicker">${escapeHtml(copy.relationshipLabel)}</p>
          <h3 id="realm-collaboration-error-title" tabindex="-1">${escapeHtml(content[0])}</h3>
          <p>${escapeHtml(content[1])}</p>
        </div>
      </div>
      <div class="realm-collaboration-actions">
        <button class="secondary" type="button" data-action="${escapeHtml(content[3])}">${escapeHtml(content[2])}</button>
      </div>
      ${statusLine(message)}
    </section>
  `;
}
