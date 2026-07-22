import {
  REALM_COLLABORATION_KEY,
  REALM_COLLABORATION_VERSION,
  encodeRealmCollaborationProposal,
  inspectRealmCollaboration,
  isValidRealmCollaborationProposal,
  isValidRealmCollaborationRecord,
  createRealmCollaborationProposal,
} from './realm-collaboration.js';

export const REALM_COLLABORATION_PENDING_KEY = 'creatorverse-realm-collaboration-pending-v1';
export const REALM_COLLABORATION_CONFIRMATION_PREVIEW_KEY = 'creatorverse-realm-collaboration-confirmation-preview-v1';
export const REALM_COLLABORATION_CONFIRMATION_MAX_FRAGMENT = 768;

const CONFIRMATION_FIELDS = new Set([
  'version',
  'proposalId',
  'sourceRealmId',
  'acceptingRealmId',
  'acceptingName',
  'acceptingTheme',
]);
const CONFIRMATION_PAYLOAD_FIELDS = Object.freeze(['v', 'pid', 'sid', 'aid', 'n', 't']);

function exactObject(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(key => fields.has(key));
}

function sameProposal(first, second) {
  return first?.version === second?.version
    && first?.proposalId === second?.proposalId
    && first?.sourceRealmId === second?.sourceRealmId
    && first?.sourceName === second?.sourceName
    && first?.sourceTheme === second?.sourceTheme;
}

function safeGet(storage, key) {
  try {
    return { status: 'ready', value: storage?.getItem(key) ?? null };
  } catch {
    return { status: 'storage-error', value: null };
  }
}

function restoreStorage(storage, key, previous) {
  if (previous === null || previous === undefined) storage?.removeItem(key);
  else storage?.setItem(key, previous);
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError('COLLAB_CONFIRM_TOKEN_INVALID');
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function exactParams(serialized) {
  const params = new URLSearchParams(serialized);
  const keys = [...params.keys()];
  if (keys.length !== CONFIRMATION_PAYLOAD_FIELDS.length) throw new TypeError('COLLAB_CONFIRM_FIELDS_INVALID');
  for (const field of CONFIRMATION_PAYLOAD_FIELDS) {
    if (params.getAll(field).length !== 1) throw new TypeError('COLLAB_CONFIRM_FIELDS_INVALID');
  }
  if (keys.some(key => !CONFIRMATION_PAYLOAD_FIELDS.includes(key))) {
    throw new TypeError('COLLAB_CONFIRM_FIELDS_INVALID');
  }
  return params;
}

function confirmationPayload(confirmation) {
  const params = new URLSearchParams();
  params.set('v', String(confirmation.version));
  params.set('pid', confirmation.proposalId);
  params.set('sid', confirmation.sourceRealmId);
  params.set('aid', confirmation.acceptingRealmId);
  params.set('n', confirmation.acceptingName);
  params.set('t', confirmation.acceptingTheme);
  return params.toString();
}

function realmShape(realm, proposalId = 'proposal_0000000000000000') {
  return {
    version: REALM_COLLABORATION_VERSION,
    proposalId,
    sourceRealmId: realm?.id,
    sourceName: realm?.name,
    sourceTheme: realm?.theme,
  };
}

export function isValidPendingRealmCollaboration(value) {
  return isValidRealmCollaborationProposal(value);
}

export function inspectPendingRealmCollaboration(storage = globalThis.localStorage, localRealmId = '') {
  const current = safeGet(storage, REALM_COLLABORATION_PENDING_KEY);
  if (current.status !== 'ready') return { status: 'storage-error', proposal: null };
  if (!current.value) return { status: 'empty', proposal: null };
  try {
    const parsed = JSON.parse(current.value);
    if (!isValidPendingRealmCollaboration(parsed)) return { status: 'invalid', proposal: null };
    if (localRealmId && parsed.sourceRealmId !== localRealmId) return { status: 'mismatch', proposal: null };
    return { status: 'ready', proposal: structuredClone(parsed) };
  } catch {
    return { status: 'invalid', proposal: null };
  }
}

export function storePendingRealmCollaboration(storage, proposal) {
  if (!isValidPendingRealmCollaboration(proposal)) return { status: 'invalid' };
  const current = inspectPendingRealmCollaboration(storage, proposal.sourceRealmId);
  if (current.status === 'ready') {
    return { status: sameProposal(current.proposal, proposal) ? 'duplicate' : 'conflict', proposal: current.proposal };
  }
  if (current.status !== 'empty') return { status: current.status === 'storage-error' ? 'storage-error' : 'invalid-storage' };

  const previous = safeGet(storage, REALM_COLLABORATION_PENDING_KEY);
  if (previous.status !== 'ready') return { status: 'storage-error' };
  try {
    storage.setItem(REALM_COLLABORATION_PENDING_KEY, JSON.stringify(proposal));
    const verified = inspectPendingRealmCollaboration(storage, proposal.sourceRealmId);
    if (verified.status !== 'ready' || !sameProposal(verified.proposal, proposal)) {
      throw new TypeError('COLLAB_PENDING_WRITE_NOT_VERIFIED');
    }
    return { status: 'success', proposal: verified.proposal };
  } catch {
    try { restoreStorage(storage, REALM_COLLABORATION_PENDING_KEY, previous.value); } catch {}
    return { status: 'storage-error' };
  }
}

export function createPendingRealmCollaboration(storage, realm, options = {}) {
  const linked = inspectRealmCollaboration(storage, realm?.id);
  if (linked.status === 'ready') return { status: 'already-linked', record: linked.record };
  if (linked.status !== 'empty') return { status: 'invalid-storage' };

  const pending = inspectPendingRealmCollaboration(storage, realm?.id);
  if (pending.status === 'ready') return resumePendingRealmCollaboration(pending.proposal, options);
  if (pending.status !== 'empty') return { status: pending.status === 'storage-error' ? 'storage-error' : 'invalid-storage' };

  const created = createRealmCollaborationProposal(realm, options);
  if (created.status !== 'ready') return created;
  const stored = storePendingRealmCollaboration(storage, created.proposal);
  if (!['success', 'duplicate'].includes(stored.status)) return stored;
  return Object.freeze({ ...created, pending: true });
}

export function resumePendingRealmCollaboration(proposal, {
  baseUrl = globalThis.location ? `${globalThis.location.origin}${globalThis.location.pathname}` : '',
} = {}) {
  if (!isValidPendingRealmCollaboration(proposal)) return { status: 'invalid' };
  const token = encodeRealmCollaborationProposal(proposal);
  return Object.freeze({
    status: 'ready',
    proposal: Object.freeze(structuredClone(proposal)),
    token,
    url: `${baseUrl}#collab=${token}`,
    pending: true,
  });
}

export function discardPendingRealmCollaboration(storage, localRealmId) {
  const current = inspectPendingRealmCollaboration(storage, localRealmId);
  if (current.status === 'empty') return { status: 'empty' };
  if (current.status !== 'ready') return { status: current.status === 'storage-error' ? 'storage-error' : 'invalid-storage' };
  const previous = safeGet(storage, REALM_COLLABORATION_PENDING_KEY);
  if (previous.status !== 'ready') return { status: 'storage-error' };
  try {
    storage.removeItem(REALM_COLLABORATION_PENDING_KEY);
    if (safeGet(storage, REALM_COLLABORATION_PENDING_KEY).value !== null) {
      throw new TypeError('COLLAB_PENDING_REMOVE_NOT_VERIFIED');
    }
    return { status: 'discarded', proposal: current.proposal };
  } catch {
    try { restoreStorage(storage, REALM_COLLABORATION_PENDING_KEY, previous.value); } catch {}
    return { status: 'storage-error', proposal: current.proposal };
  }
}

export function isValidRealmCollaborationConfirmation(value) {
  if (!exactObject(value, CONFIRMATION_FIELDS) || value.version !== REALM_COLLABORATION_VERSION) return false;
  if (value.sourceRealmId === value.acceptingRealmId) return false;
  const accepting = realmShape({
    id: value.acceptingRealmId,
    name: value.acceptingName,
    theme: value.acceptingTheme,
  }, value.proposalId);
  const source = realmShape({
    id: value.sourceRealmId,
    name: value.acceptingName,
    theme: value.acceptingTheme,
  }, value.proposalId);
  return isValidRealmCollaborationProposal(accepting)
    && isValidRealmCollaborationProposal(source);
}

export function encodeRealmCollaborationConfirmation(confirmation) {
  if (!isValidRealmCollaborationConfirmation(confirmation)) throw new TypeError('COLLAB_CONFIRMATION_INVALID');
  const token = encodeBase64Url(confirmationPayload(confirmation));
  if (token.length > REALM_COLLABORATION_CONFIRMATION_MAX_FRAGMENT) {
    throw new TypeError('COLLAB_CONFIRM_TOKEN_TOO_LARGE');
  }
  return token;
}

export function decodeRealmCollaborationConfirmation(token) {
  if (typeof token !== 'string' || token.length < 1 || token.length > REALM_COLLABORATION_CONFIRMATION_MAX_FRAGMENT) {
    throw new TypeError('COLLAB_CONFIRM_TOKEN_INVALID');
  }
  const params = exactParams(decodeBase64Url(token));
  const confirmation = Object.freeze({
    version: Number(params.get('v')),
    proposalId: params.get('pid'),
    sourceRealmId: params.get('sid'),
    acceptingRealmId: params.get('aid'),
    acceptingName: params.get('n'),
    acceptingTheme: params.get('t'),
  });
  if (!isValidRealmCollaborationConfirmation(confirmation)) throw new TypeError('COLLAB_CONFIRMATION_INVALID');
  return confirmation;
}

export function parseRealmCollaborationConfirmationHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) return { status: 'absent' };
  const serialized = hash.slice(1);
  if (!serialized) return { status: 'absent' };
  const params = new URLSearchParams(serialized);
  if ([...params.keys()].some(key => key !== 'collab-confirm') || params.getAll('collab-confirm').length !== 1) {
    return { status: 'invalid' };
  }
  try {
    return { status: 'ready', confirmation: decodeRealmCollaborationConfirmation(params.get('collab-confirm')) };
  } catch {
    return { status: 'invalid' };
  }
}

export function createRealmCollaborationConfirmation(localRealm, record, {
  baseUrl = globalThis.location ? `${globalThis.location.origin}${globalThis.location.pathname}` : '',
} = {}) {
  if (!isValidRealmCollaborationRecord(record) || record.localRealmId !== localRealm?.id) return { status: 'invalid' };
  const acceptingShape = realmShape(localRealm, record.proposalId);
  if (!isValidRealmCollaborationProposal(acceptingShape)) return { status: 'invalid' };
  const confirmation = Object.freeze({
    version: REALM_COLLABORATION_VERSION,
    proposalId: record.proposalId,
    sourceRealmId: record.sourceRealmId,
    acceptingRealmId: localRealm.id,
    acceptingName: localRealm.name,
    acceptingTheme: localRealm.theme,
  });
  const token = encodeRealmCollaborationConfirmation(confirmation);
  return Object.freeze({
    status: 'ready',
    confirmation,
    token,
    url: `${baseUrl}#collab-confirm=${token}`,
  });
}

export function writeRealmCollaborationConfirmationPreview(storage, confirmation) {
  if (!isValidRealmCollaborationConfirmation(confirmation)) throw new TypeError('COLLAB_CONFIRMATION_INVALID');
  storage.setItem(REALM_COLLABORATION_CONFIRMATION_PREVIEW_KEY, JSON.stringify(confirmation));
}

export function readRealmCollaborationConfirmationPreview(storage) {
  try {
    const serialized = storage?.getItem(REALM_COLLABORATION_CONFIRMATION_PREVIEW_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    return isValidRealmCollaborationConfirmation(parsed) ? Object.freeze(parsed) : null;
  } catch {
    return null;
  }
}

export function clearRealmCollaborationConfirmationPreview(storage) {
  try { storage?.removeItem(REALM_COLLABORATION_CONFIRMATION_PREVIEW_KEY); } catch {}
}

function recordMatchesConfirmation(record, localRealm, confirmation) {
  return record?.localRealmId === localRealm?.id
    && record?.sourceRealmId === confirmation?.acceptingRealmId
    && record?.proposalId === confirmation?.proposalId
    && record?.sourceName === confirmation?.acceptingName
    && record?.sourceTheme === confirmation?.acceptingTheme;
}

export function confirmRealmCollaboration(storage, localRealm, confirmation) {
  if (!isValidRealmCollaborationConfirmation(confirmation)) return { status: 'invalid' };
  if (confirmation.sourceRealmId !== localRealm?.id) return { status: 'wrong-source' };
  if (confirmation.acceptingRealmId === localRealm.id) return { status: 'self-link' };
  const localShape = realmShape(localRealm, confirmation.proposalId);
  if (!isValidRealmCollaborationProposal(localShape)) return { status: 'invalid' };

  const existing = inspectRealmCollaboration(storage, localRealm.id);
  if (existing.status === 'ready') {
    return {
      status: recordMatchesConfirmation(existing.record, localRealm, confirmation) ? 'duplicate' : 'already-linked',
      record: existing.record,
    };
  }
  if (existing.status !== 'empty') return { status: 'invalid-storage' };

  const pending = inspectPendingRealmCollaboration(storage, localRealm.id);
  if (pending.status === 'empty') return { status: 'no-pending' };
  if (pending.status !== 'ready') return { status: pending.status === 'storage-error' ? 'storage-error' : 'invalid-storage' };
  if (pending.proposal.proposalId !== confirmation.proposalId
    || pending.proposal.sourceRealmId !== confirmation.sourceRealmId
    || pending.proposal.sourceName !== localRealm.name
    || pending.proposal.sourceTheme !== localRealm.theme) {
    return { status: 'mismatch' };
  }

  const record = Object.freeze({
    version: REALM_COLLABORATION_VERSION,
    localRealmId: localRealm.id,
    sourceRealmId: confirmation.acceptingRealmId,
    proposalId: confirmation.proposalId,
    sourceName: confirmation.acceptingName,
    sourceTheme: confirmation.acceptingTheme,
  });
  if (!isValidRealmCollaborationRecord(record)) return { status: 'invalid' };

  const previousLink = safeGet(storage, REALM_COLLABORATION_KEY);
  const previousPending = safeGet(storage, REALM_COLLABORATION_PENDING_KEY);
  if (previousLink.status !== 'ready' || previousPending.status !== 'ready') return { status: 'storage-error' };

  try {
    storage.setItem(REALM_COLLABORATION_KEY, JSON.stringify(record));
    const verifiedLink = inspectRealmCollaboration(storage, localRealm.id);
    if (verifiedLink.status !== 'ready' || !recordMatchesConfirmation(verifiedLink.record, localRealm, confirmation)) {
      throw new TypeError('COLLAB_CONFIRM_WRITE_NOT_VERIFIED');
    }
    storage.removeItem(REALM_COLLABORATION_PENDING_KEY);
    if (inspectPendingRealmCollaboration(storage, localRealm.id).status !== 'empty') {
      throw new TypeError('COLLAB_CONFIRM_PENDING_NOT_REMOVED');
    }
    return { status: 'success', record: verifiedLink.record };
  } catch {
    try {
      restoreStorage(storage, REALM_COLLABORATION_KEY, previousLink.value);
      restoreStorage(storage, REALM_COLLABORATION_PENDING_KEY, previousPending.value);
    } catch {}
    return { status: 'storage-error' };
  }
}
