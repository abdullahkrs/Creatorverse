export const REALM_COLLABORATION_VERSION = 1;
export const REALM_COLLABORATION_KEY = 'creatorverse-realm-collaboration-v1';
export const REALM_COLLABORATION_PREVIEW_KEY = 'creatorverse-realm-collaboration-preview-v1';
export const REALM_COLLABORATION_MAX_FRAGMENT = 768;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{16,64}$/u;
const THEMES = new Set(['cosmic', 'wild', 'future']);
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const PROPOSAL_FIELDS = new Set(['version', 'proposalId', 'sourceRealmId', 'sourceName', 'sourceTheme']);
const RECORD_FIELDS = new Set(['version', 'localRealmId', 'sourceRealmId', 'proposalId', 'sourceName', 'sourceTheme']);
const PAYLOAD_FIELDS = Object.freeze(['v', 'pid', 'rid', 'n', 't']);

function plainObject(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(key => fields.has(key));
}

function validIdentifier(value) {
  return typeof value === 'string'
    && IDENTIFIER_PATTERN.test(value)
    && !CONTROL_OR_BIDI.test(value);
}

function validName(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 28
    && value.normalize('NFKC') === value
    && value.trim() === value
    && !/\s{2,}/u.test(value)
    && !CONTROL_OR_BIDI.test(value)
    && !/[<>]/u.test(value);
}

function validTheme(value) {
  return THEMES.has(value);
}

export function isValidRealmCollaborationProposal(value) {
  return plainObject(value, PROPOSAL_FIELDS)
    && value.version === REALM_COLLABORATION_VERSION
    && validIdentifier(value.proposalId)
    && validIdentifier(value.sourceRealmId)
    && validName(value.sourceName)
    && validTheme(value.sourceTheme);
}

export function isValidRealmCollaborationRecord(value) {
  return plainObject(value, RECORD_FIELDS)
    && value.version === REALM_COLLABORATION_VERSION
    && validIdentifier(value.localRealmId)
    && validIdentifier(value.sourceRealmId)
    && value.localRealmId !== value.sourceRealmId
    && validIdentifier(value.proposalId)
    && validName(value.sourceName)
    && validTheme(value.sourceTheme);
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError('COLLAB_TOKEN_INVALID');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function exactParams(serialized) {
  const params = new URLSearchParams(serialized);
  const keys = [...params.keys()];
  if (keys.length !== PAYLOAD_FIELDS.length) throw new TypeError('COLLAB_FIELDS_INVALID');
  for (const field of PAYLOAD_FIELDS) {
    if (params.getAll(field).length !== 1) throw new TypeError('COLLAB_FIELDS_INVALID');
  }
  if (keys.some(key => !PAYLOAD_FIELDS.includes(key))) throw new TypeError('COLLAB_FIELDS_INVALID');
  return params;
}

function proposalPayload(proposal) {
  const params = new URLSearchParams();
  params.set('v', String(proposal.version));
  params.set('pid', proposal.proposalId);
  params.set('rid', proposal.sourceRealmId);
  params.set('n', proposal.sourceName);
  params.set('t', proposal.sourceTheme);
  return params.toString();
}

export function encodeRealmCollaborationProposal(proposal) {
  if (!isValidRealmCollaborationProposal(proposal)) throw new TypeError('COLLAB_PROPOSAL_INVALID');
  const token = encodeBase64Url(proposalPayload(proposal));
  if (token.length > REALM_COLLABORATION_MAX_FRAGMENT) throw new TypeError('COLLAB_TOKEN_TOO_LARGE');
  return token;
}

export function decodeRealmCollaborationProposal(token) {
  if (typeof token !== 'string' || token.length < 1 || token.length > REALM_COLLABORATION_MAX_FRAGMENT) {
    throw new TypeError('COLLAB_TOKEN_INVALID');
  }
  const params = exactParams(decodeBase64Url(token));
  const proposal = Object.freeze({
    version: Number(params.get('v')),
    proposalId: params.get('pid'),
    sourceRealmId: params.get('rid'),
    sourceName: params.get('n'),
    sourceTheme: params.get('t'),
  });
  if (!isValidRealmCollaborationProposal(proposal)) throw new TypeError('COLLAB_PROPOSAL_INVALID');
  return proposal;
}

export function parseRealmCollaborationHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) return { status: 'absent' };
  const serialized = hash.slice(1);
  if (!serialized) return { status: 'absent' };
  const params = new URLSearchParams(serialized);
  if ([...params.keys()].some(key => key !== 'collab') || params.getAll('collab').length !== 1) {
    return { status: 'invalid' };
  }
  try {
    return { status: 'ready', proposal: decodeRealmCollaborationProposal(params.get('collab')) };
  } catch {
    return { status: 'invalid' };
  }
}

function generateProposalId(cryptoLike) {
  if (typeof cryptoLike?.randomUUID === 'function') {
    return `proposal_${cryptoLike.randomUUID().replaceAll('-', '')}`;
  }
  if (typeof cryptoLike?.getRandomValues !== 'function') throw new TypeError('COLLAB_CRYPTO_UNAVAILABLE');
  const bytes = new Uint8Array(16);
  cryptoLike.getRandomValues(bytes);
  return `proposal_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function createRealmCollaborationProposal(realm, {
  cryptoLike = globalThis.crypto,
  baseUrl = globalThis.location ? `${globalThis.location.origin}${globalThis.location.pathname}` : '',
} = {}) {
  const source = {
    version: REALM_COLLABORATION_VERSION,
    proposalId: generateProposalId(cryptoLike),
    sourceRealmId: realm?.id,
    sourceName: realm?.name,
    sourceTheme: realm?.theme,
  };
  if (!isValidRealmCollaborationProposal(source)) return { status: 'invalid' };
  const token = encodeRealmCollaborationProposal(source);
  return Object.freeze({
    status: 'ready',
    proposal: Object.freeze(source),
    token,
    url: `${baseUrl}#collab=${token}`,
  });
}

export function inspectRealmCollaboration(storage = globalThis.localStorage, localRealmId = '') {
  try {
    const serialized = storage?.getItem(REALM_COLLABORATION_KEY);
    if (!serialized) return { status: 'empty', record: null };
    const parsed = JSON.parse(serialized);
    if (!isValidRealmCollaborationRecord(parsed)) return { status: 'invalid', record: null };
    if (localRealmId && parsed.localRealmId !== localRealmId) return { status: 'mismatch', record: null };
    return { status: 'ready', record: structuredClone(parsed) };
  } catch {
    return { status: 'invalid', record: null };
  }
}

export function acceptRealmCollaboration(storage, localRealm, proposal) {
  if (!validIdentifier(localRealm?.id) || !isValidRealmCollaborationProposal(proposal)) return { status: 'invalid' };
  if (localRealm.id === proposal.sourceRealmId) return { status: 'self-link' };

  const current = inspectRealmCollaboration(storage, localRealm.id);
  if (current.status === 'invalid' || current.status === 'mismatch') return { status: 'invalid-storage' };
  if (current.status === 'ready') {
    const same = current.record.proposalId === proposal.proposalId
      && current.record.sourceRealmId === proposal.sourceRealmId;
    return { status: same ? 'duplicate' : 'already-linked', record: current.record };
  }

  const record = Object.freeze({
    version: REALM_COLLABORATION_VERSION,
    localRealmId: localRealm.id,
    sourceRealmId: proposal.sourceRealmId,
    proposalId: proposal.proposalId,
    sourceName: proposal.sourceName,
    sourceTheme: proposal.sourceTheme,
  });
  const previous = storage?.getItem(REALM_COLLABORATION_KEY);
  try {
    storage.setItem(REALM_COLLABORATION_KEY, JSON.stringify(record));
    const verified = inspectRealmCollaboration(storage, localRealm.id);
    if (verified.status !== 'ready') throw new TypeError('COLLAB_WRITE_NOT_VERIFIED');
    return { status: 'success', record: verified.record };
  } catch {
    try {
      if (previous === null || previous === undefined) storage?.removeItem(REALM_COLLABORATION_KEY);
      else storage?.setItem(REALM_COLLABORATION_KEY, previous);
    } catch {
      // The caller still receives a fail-closed result; no success is claimed.
    }
    return { status: 'storage-error' };
  }
}

export function removeRealmCollaboration(storage, localRealmId) {
  const current = inspectRealmCollaboration(storage, localRealmId);
  if (current.status === 'empty') return { status: 'empty' };
  if (current.status !== 'ready') return { status: 'invalid-storage' };
  const previous = storage.getItem(REALM_COLLABORATION_KEY);
  try {
    storage.removeItem(REALM_COLLABORATION_KEY);
    if (storage.getItem(REALM_COLLABORATION_KEY) !== null) throw new TypeError('COLLAB_REMOVE_NOT_VERIFIED');
    return { status: 'removed', record: current.record };
  } catch {
    try { storage.setItem(REALM_COLLABORATION_KEY, previous); } catch {}
    return { status: 'storage-error', record: current.record };
  }
}

export function writeRealmCollaborationPreview(storage, proposal) {
  if (!isValidRealmCollaborationProposal(proposal)) throw new TypeError('COLLAB_PROPOSAL_INVALID');
  storage.setItem(REALM_COLLABORATION_PREVIEW_KEY, JSON.stringify(proposal));
}

export function readRealmCollaborationPreview(storage) {
  try {
    const serialized = storage?.getItem(REALM_COLLABORATION_PREVIEW_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    return isValidRealmCollaborationProposal(parsed) ? Object.freeze(parsed) : null;
  } catch {
    return null;
  }
}

export function clearRealmCollaborationPreview(storage) {
  try { storage?.removeItem(REALM_COLLABORATION_PREVIEW_KEY); } catch {}
}
