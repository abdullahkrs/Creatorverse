import {
  CREATOR_LEDGER_LIMIT,
  CREATOR_LEDGER_VERSION,
  restoreCreatorLedger,
} from './creator-ledger.js';
import { DISTRICT_CONTRIBUTION, DISTRICT_ID } from './district-progress.js';

export const BEACON_DISTRICT_MAX_ENERGY = CREATOR_LEDGER_LIMIT * DISTRICT_CONTRIBUTION;
export const BEACON_DISTRICT_STAGE_IDS = Object.freeze([
  'locked',
  'outpost',
  'connected',
  'illuminated',
]);

const STAGE_INDEX = Object.freeze({
  locked: 0,
  outpost: 1,
  connected: 2,
  illuminated: 3,
});

function strictRealm(realm) {
  const restored = restoreCreatorLedger({
    version: CREATOR_LEDGER_VERSION,
    realms: [realm],
  });
  return restored.realms.length === 1 ? restored.realms[0] : null;
}

function stageForEnergy(totalEnergy) {
  if (totalEnergy === 0) return 'locked';
  if (totalEnergy < 9) return 'outpost';
  if (totalEnergy < 18) return 'connected';
  return 'illuminated';
}

function nextThresholdForStage(stageId) {
  if (stageId === 'locked') return 3;
  if (stageId === 'outpost') return 9;
  if (stageId === 'connected') return 18;
  return null;
}

export function deriveBeaconDistrictGrowth(realm) {
  const restored = strictRealm(realm);
  if (!restored || restored.districtId !== DISTRICT_ID) {
    return Object.freeze({ status: 'unavailable' });
  }

  const contributionCount = restored.receipts.length;
  const totalEnergy = restored.total;
  if (
    totalEnergy !== contributionCount * DISTRICT_CONTRIBUTION
    || totalEnergy % DISTRICT_CONTRIBUTION !== 0
    || totalEnergy < 0
    || totalEnergy > BEACON_DISTRICT_MAX_ENERGY
  ) {
    return Object.freeze({ status: 'unavailable' });
  }

  const stageId = stageForEnergy(totalEnergy);
  return Object.freeze({
    status: 'ready',
    districtId: DISTRICT_ID,
    stageId,
    stageIndex: STAGE_INDEX[stageId],
    contributionCount,
    totalEnergy,
    maxEnergy: BEACON_DISTRICT_MAX_ENERGY,
    nextThreshold: nextThresholdForStage(stageId),
    complete: stageId === 'illuminated',
  });
}

export function compareBeaconDistrictGrowth(previous, next) {
  if (previous?.status !== 'ready' || next?.status !== 'ready') {
    return Object.freeze({ status: 'unavailable' });
  }
  if (next.totalEnergy !== previous.totalEnergy + DISTRICT_CONTRIBUTION) {
    return Object.freeze({ status: 'unavailable' });
  }
  return Object.freeze({
    status: 'ready',
    advanced: next.stageIndex > previous.stageIndex,
    fromStageId: previous.stageId,
    toStageId: next.stageId,
    totalEnergy: next.totalEnergy,
  });
}
