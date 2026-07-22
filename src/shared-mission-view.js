import { getMissionScheduleCopy } from './mission-schedule-i18n.js';
import { getMissionTemplateCopy } from './mission-templates.js';
import { getSharedMissionCopy } from './shared-mission-i18n.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function connectionArtwork(state = 'ready') {
  return `
    <svg class="shared-mission-signal" data-shared-signal="${escapeHtml(state)}" viewBox="0 0 260 84" aria-hidden="true" focusable="false">
      <g class="shared-mission-terminal shared-mission-terminal-first">
        <path d="M18 42 38 20l24 10v24L38 64Z"/><circle cx="40" cy="42" r="5"/>
      </g>
      <path class="shared-mission-rail" d="M66 42h42l14-14h30l14 14h28"/>
      <circle class="shared-mission-junction" cx="137" cy="28" r="7"/>
      <g class="shared-mission-terminal shared-mission-terminal-second">
        <path d="m198 30 24-10 20 22-20 22-24-10Z"/><circle cx="220" cy="42" r="5"/>
      </g>
    </svg>
  `;
}

function pairMarkup(invite, copy, state = 'ready') {
  return `
    <div class="shared-mission-pair" aria-label="${escapeHtml(copy.pairLabel)}">
      <div class="shared-mission-realm">
        <span>${escapeHtml(copy.initiatorLabel)}</span>
        <strong><bdi>${escapeHtml(invite.initiatorName)}</bdi></strong>
      </div>
      ${connectionArtwork(state)}
      <div class="shared-mission-realm">
        <span>${escapeHtml(copy.linkedLabel)}</span>
        <strong><bdi>${escapeHtml(invite.linkedName)}</bdi></strong>
      </div>
    </div>
  `;
}

function linkedPairMarkup(realm, collaboration, copy) {
  return pairMarkup({
    initiatorName: realm.name,
    linkedName: collaboration.sourceName,
  }, copy, 'setup');
}

function statusMarkup(message = '') {
  return `<p class="shared-mission-status" data-shared-live aria-live="polite" aria-atomic="true">${escapeHtml(message)}</p>`;
}

function shareActionPresentation(copy, action, kind = 'invite') {
  const invite = kind === 'invite';
  const base = action.mode === 'share'
    ? (invite ? copy.shareInvite : copy.shareReceipt)
    : (invite ? copy.copyInvite : copy.copyReceipt);
  if (action.state === 'pending') return { label: action.mode === 'share' ? copy.sharing : copy.copying, disabled: true };
  if (['failed', 'unsupported'].includes(action.state)) return { label: copy.retry, disabled: false };
  if (action.state === 'denied') return { label: invite ? copy.copyInvite : copy.copyReceipt, disabled: false };
  return { label: base, disabled: false };
}

export function renderSharedMissionTrigger(locale) {
  const copy = getSharedMissionCopy(locale);
  return `<button class="secondary shared-mission-trigger" type="button" data-action="open-shared-mission" aria-expanded="false">${escapeHtml(copy.action)}</button>`;
}

export function renderSharedMissionSetup({ locale, realm, collaboration, draft, invite = null, action = {}, message = '' }) {
  const copy = getSharedMissionCopy(locale);
  const missionCopy = getMissionTemplateCopy(locale);
  const scheduleCopy = getMissionScheduleCopy(locale);
  const ready = Boolean(invite?.url);
  const share = shareActionPresentation(copy, action, 'invite');
  const manual = ready && ['failed', 'unsupported', 'denied'].includes(action.state);
  return `
    <section class="shared-mission shared-mission-setup" data-shared-mission data-state="${ready ? 'invite-ready' : 'selection'}" aria-labelledby="shared-mission-title">
      <header class="shared-mission-heading">
        <div>
          <p class="section-kicker">${escapeHtml(copy.pairLabel)}</p>
          <h3 id="shared-mission-title" tabindex="-1">${escapeHtml(ready ? copy.inviteReadyTitle : copy.title)}</h3>
          <p>${escapeHtml(ready ? copy.inviteReadySupport : copy.support)}</p>
        </div>
        <button class="secondary" type="button" data-action="close-shared-mission">${escapeHtml(copy.cancel)}</button>
      </header>
      ${linkedPairMarkup(realm, collaboration, copy)}
      ${ready ? `
        <dl class="shared-mission-facts">
          <div><dt>${escapeHtml(copy.missionLabel)}</dt><dd>${escapeHtml(missionCopy.templates[invite.invite.missionId].name)}</dd></div>
          <div><dt>${escapeHtml(copy.selectWindow)}</dt><dd><bdi>${escapeHtml(scheduleCopy.options[invite.invite.scheduleId])}</bdi></dd></div>
        </dl>
        <div class="shared-mission-actions">
          <button class="secondary" type="button" data-action="share-shared-mission" ${share.disabled ? 'disabled aria-busy="true"' : ''}>${escapeHtml(share.label)}</button>
        </div>
        ${manual ? `<label class="shared-mission-manual"><span>${escapeHtml(copy.manual)}</span><input readonly dir="ltr" value="${escapeHtml(invite.url)}"></label>` : ''}
      ` : `
        <form class="shared-mission-form" data-form="shared-mission">
          <fieldset>
            <legend>${escapeHtml(copy.selectMission)}</legend>
            <div class="shared-mission-options">
              ${Object.entries(missionCopy.templates).map(([id, item]) => `
                <label><input type="radio" name="shared-mission-template" value="${escapeHtml(id)}" ${draft.missionId === id ? 'checked' : ''}><span>${escapeHtml(item.name)}</span></label>
              `).join('')}
            </div>
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(copy.selectWindow)}</legend>
            <div class="shared-mission-options">
              ${Object.entries(scheduleCopy.options).map(([id, label]) => `
                <label><input type="radio" name="shared-mission-window" value="${escapeHtml(id)}" ${draft.scheduleId === id ? 'checked' : ''}><span><bdi>${escapeHtml(label)}</bdi></span></label>
              `).join('')}
            </div>
          </fieldset>
          <div class="shared-mission-actions">
            <button class="primary" type="submit" data-action="create-shared-mission" ${action.state === 'creating' ? 'disabled aria-busy="true"' : ''}>${escapeHtml(action.state === 'creating' ? copy.creating : copy.create)}</button>
          </div>
        </form>
      `}
      ${statusMarkup(message)}
    </section>
  `;
}

function roleOptions(progress, copy) {
  return `
    <fieldset class="shared-mission-role-options">
      <legend>${escapeHtml(copy.chooseRole)}</legend>
      <div>
        ${['builder', 'explorer', 'guardian'].map(role => `
          <button type="button" data-action="select-shared-role" data-role="${role}" aria-pressed="${String(progress.roleId === role)}">${escapeHtml(copy[role])}</button>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function missionActions(invite, progress, locale, copy) {
  const template = getMissionTemplateCopy(locale).templates[invite.missionId];
  if (invite.missionId === 'route-choice') {
    return `
      <div class="shared-mission-command-grid" aria-label="${escapeHtml(template.name)}">
        <button class="primary" type="button" data-action="activate-shared-mission" data-command="sky" ${progress.roleId ? '' : 'disabled'}>${escapeHtml(template.actions.sky)}</button>
        <button class="primary" type="button" data-action="activate-shared-mission" data-command="ocean" ${progress.roleId ? '' : 'disabled'}>${escapeHtml(template.actions.ocean)}</button>
      </div>
    `;
  }
  if (invite.missionId === 'relay-sequence') {
    const stepLabels = [copy.stepOne, copy.stepTwo, copy.stepThree];
    return `
      <p class="shared-mission-step"><bdi>${escapeHtml(stepLabels[Math.min(progress.step, 2)])}</bdi></p>
      <div class="shared-mission-command-grid shared-mission-command-grid-three" aria-label="${escapeHtml(template.name)}">
        ${[1, 2, 3].map(step => {
          const enabled = Boolean(progress.roleId) && progress.step + 1 === step;
          return `<button class="primary" type="button" data-action="activate-shared-mission" data-command="${step}" ${enabled ? '' : 'disabled'}>${escapeHtml(template.actions[step])}</button>`;
        }).join('')}
      </div>
    `;
  }
  return `
    <p class="shared-mission-target">${escapeHtml(copy.targetWave)}</p>
    <div class="shared-mission-command-grid shared-mission-command-grid-three" aria-label="${escapeHtml(template.name)}">
      ${Object.entries(template.actions).map(([id, label]) => `<button class="primary" type="button" data-action="activate-shared-mission" data-command="${escapeHtml(id)}" ${progress.roleId ? '' : 'disabled'}>${escapeHtml(label)}</button>`).join('')}
    </div>
  `;
}

function receiptActionMarkup(item, action, copy, index) {
  const presentation = shareActionPresentation(copy, action, 'receipt');
  const manual = ['failed', 'unsupported', 'denied'].includes(action.state);
  return `
    <div class="shared-mission-receipt-action" data-receipt-index="${index}">
      <p><span>${escapeHtml(copy.receiptFor)}</span> <strong><bdi>${escapeHtml(item.targetName)}</bdi></strong> <bdi dir="ltr">+3</bdi></p>
      <button class="secondary" type="button" data-action="share-shared-receipt" data-receipt-index="${index}" ${presentation.disabled ? 'disabled aria-busy="true"' : ''}>
        <span>${escapeHtml(presentation.label)}</span> <bdi>${escapeHtml(item.targetName)}</bdi>
      </button>
      ${manual ? `<label class="shared-mission-manual"><span>${escapeHtml(copy.exactReceipt)}</span><input readonly dir="ltr" value="${escapeHtml(item.url)}"></label>` : ''}
      <p class="shared-mission-status" aria-live="polite" aria-atomic="true">${escapeHtml(action.message || '')}</p>
    </div>
  `;
}

export function renderSharedMissionFollower({ locale, invite, windowState, progress, message = '', receiptActions = [] }) {
  const copy = getSharedMissionCopy(locale);
  const mission = getMissionTemplateCopy(locale).templates[invite.missionId];
  if (windowState !== 'active') {
    const upcoming = windowState === 'upcoming';
    return `
      <section class="shared-mission shared-mission-follower is-blocked" data-shared-mission data-state="${escapeHtml(windowState)}" aria-labelledby="shared-mission-follower-title">
        <header class="shared-mission-heading"><div><p class="section-kicker">${escapeHtml(copy.followerKicker)}</p><h2 id="shared-mission-follower-title" tabindex="-1">${escapeHtml(upcoming ? copy.upcomingTitle : copy.expiredTitle)}</h2><p>${escapeHtml(upcoming ? copy.upcomingSupport : copy.expiredSupport)}</p></div></header>
        ${pairMarkup(invite, copy, windowState)}
        <div class="shared-mission-actions"><button class="primary" type="button" data-action="discard-shared-mission">${escapeHtml(copy.returnRealm)}</button></div>
      </section>
    `;
  }
  return `
    <section class="shared-mission shared-mission-follower" data-shared-mission data-state="${progress.completed ? 'complete' : 'active'}" aria-labelledby="shared-mission-follower-title">
      <header class="shared-mission-heading">
        <div>
          <p class="section-kicker">${escapeHtml(copy.followerKicker)}</p>
          <h2 id="shared-mission-follower-title" tabindex="-1">${escapeHtml(progress.completed ? copy.completeTitle : copy.followerTitle)}</h2>
          <p>${escapeHtml(progress.completed ? copy.completeSupport : copy.followerSupport)}</p>
        </div>
      </header>
      ${pairMarkup(invite, copy, progress.completed ? 'split' : 'active')}
      ${progress.completed ? `
        <dl class="shared-mission-facts">
          <div><dt>${escapeHtml(copy.missionLabel)}</dt><dd>${escapeHtml(mission.name)}</dd></div>
          <div><dt>${escapeHtml(copy.roleLabel)}</dt><dd>${escapeHtml(copy[progress.roleId])}</dd></div>
          <div><dt>${escapeHtml(copy.contributionLabel)}</dt><dd><bdi dir="ltr">+3</bdi> × 2</dd></div>
        </dl>
        <div class="shared-mission-receipt-actions">
          ${progress.result.receipts.map((item, index) => receiptActionMarkup(item, receiptActions[index] || { mode: 'copy', state: 'idle', message: '' }, copy, index)).join('')}
        </div>
      ` : `
        <div class="shared-mission-play">
          <div><p class="section-kicker">${escapeHtml(copy.missionReady)}</p><h3>${escapeHtml(mission.name)}</h3><p>${escapeHtml(mission.prompt)}</p></div>
          ${roleOptions(progress, copy)}
          ${missionActions(invite, progress, locale, copy)}
        </div>
      `}
      ${statusMarkup(message)}
    </section>
  `;
}

export function renderSharedMissionReceiptPreview({ locale, receipt, status, realm = null, importing = false, message = '' }) {
  const copy = getSharedMissionCopy(locale);
  const mission = getMissionTemplateCopy(locale).templates[receipt.missionId];
  const targetName = receipt.targetRealmId === receipt.initiatorRealmId ? receipt.initiatorName : receipt.linkedName;
  const content = {
    ready: [copy.previewTitle, copy.previewSupport, copy.import, 'import-shared-receipt'],
    success: [copy.importSuccessTitle, copy.importSuccessSupport, copy.returnRealm, 'discard-shared-receipt'],
    duplicate: [copy.duplicateTitle, copy.duplicateSupport, copy.returnRealm, 'discard-shared-receipt'],
    'wrong-realm': [copy.wrongRealmTitle, copy.wrongRealmSupport, copy.returnRealm, 'discard-shared-receipt'],
    'collaboration-removed': [copy.removedTitle, copy.removedSupport, copy.returnRealm, 'discard-shared-receipt'],
    full: [copy.ledgerFullTitle, copy.ledgerFullSupport, copy.returnRealm, 'discard-shared-receipt'],
    'storage-error': [copy.storageTitle, copy.storageSupport, copy.retry, 'import-shared-receipt'],
    'invalid-storage': [copy.storageTitle, copy.storageSupport, copy.returnRealm, 'discard-shared-receipt'],
    mismatch: [copy.mismatchTitle, copy.mismatchSupport, copy.returnRealm, 'discard-shared-receipt'],
    'no-realm': [copy.noRealmTitle, copy.noRealmSupport, copy.returnRealm, 'discard-shared-receipt'],
  }[status] || [copy.invalidTitle, copy.invalidSupport, copy.returnRealm, 'discard-shared-receipt'];
  return `
    <section class="shared-mission shared-mission-import" data-shared-mission data-state="${escapeHtml(status)}" aria-labelledby="shared-mission-import-title">
      <header class="shared-mission-heading">
        <div><p class="section-kicker">${escapeHtml(copy.previewKicker)}</p><h2 id="shared-mission-import-title" tabindex="-1">${escapeHtml(content[0])}</h2><p>${escapeHtml(content[1])}</p></div>
      </header>
      ${pairMarkup({
        initiatorName: receipt.initiatorName,
        linkedName: receipt.linkedName,
      }, copy, status === 'success' ? 'imported' : 'receipt')}
      <dl class="shared-mission-facts">
        <div><dt>${escapeHtml(copy.receiptFor)}</dt><dd><bdi>${escapeHtml(targetName)}</bdi></dd></div>
        <div><dt>${escapeHtml(copy.missionLabel)}</dt><dd>${escapeHtml(mission.name)}</dd></div>
        <div><dt>${escapeHtml(copy.roleLabel)}</dt><dd>${escapeHtml(copy[receipt.roleId])}</dd></div>
        <div><dt>${escapeHtml(copy.contributionLabel)}</dt><dd><bdi dir="ltr">+3</bdi></dd></div>
        ${realm ? `<div><dt>${escapeHtml(copy.pairLabel)}</dt><dd><bdi>${escapeHtml(realm.name)}</bdi></dd></div>` : ''}
      </dl>
      <div class="shared-mission-actions">
        <button class="primary" type="button" data-action="${escapeHtml(content[3])}" ${importing ? 'disabled aria-busy="true"' : ''}>${escapeHtml(importing ? copy.importing : content[2])}</button>
      </div>
      ${statusMarkup(message)}
    </section>
  `;
}

export function renderSharedMissionError({ locale, kind = 'invalid' }) {
  const copy = getSharedMissionCopy(locale);
  const noRealm = kind === 'no-realm';
  return `
    <section class="shared-mission shared-mission-error" data-shared-mission data-state="${escapeHtml(kind)}" aria-labelledby="shared-mission-error-title">
      <header class="shared-mission-heading"><div><p class="section-kicker">${escapeHtml(copy.pairLabel)}</p><h2 id="shared-mission-error-title" tabindex="-1">${escapeHtml(noRealm ? copy.noRealmTitle : copy.invalidTitle)}</h2><p>${escapeHtml(noRealm ? copy.noRealmSupport : copy.invalidSupport)}</p></div></header>
      <div class="shared-mission-actions"><button class="primary" type="button" data-action="discard-shared-mission">${escapeHtml(copy.returnRealm)}</button></div>
    </section>
  `;
}
