import { parsePrototypeInviteFragment } from './prototype-invite.js';

let activeInviteHash = null;

function syncMissionInstanceContext(event) {
  const hash = globalThis.location?.hash || '';
  const parsed = parsePrototypeInviteFragment(hash);
  const previousInviteHash = activeInviteHash;
  activeInviteHash = parsed.status === 'valid' ? hash : null;

  if (parsed.status === 'valid' && parsed.invite.missionInstanceId) {
    globalThis.__creatorverseMissionInstanceId = parsed.invite.missionInstanceId;
  } else {
    delete globalThis.__creatorverseMissionInstanceId;
  }

  if (event?.type === 'hashchange'
    && previousInviteHash
    && activeInviteHash
    && activeInviteHash !== previousInviteHash) {
    globalThis.location?.reload?.();
  }
}

syncMissionInstanceContext();
globalThis.addEventListener?.('hashchange', syncMissionInstanceContext);
