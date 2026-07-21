import { parsePrototypeInviteFragment } from './prototype-invite.js';

function syncMissionInstanceContext() {
  const parsed = parsePrototypeInviteFragment(globalThis.location?.hash || '');
  if (parsed.status === 'valid' && parsed.invite.missionInstanceId) {
    globalThis.__creatorverseMissionInstanceId = parsed.invite.missionInstanceId;
  } else {
    delete globalThis.__creatorverseMissionInstanceId;
  }
}

syncMissionInstanceContext();
globalThis.addEventListener?.('hashchange', syncMissionInstanceContext);
