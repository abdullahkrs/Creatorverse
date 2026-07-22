import {
  CREATOR_LEDGER_LIMIT,
  CREATOR_LEDGER_VERSION,
  restoreCreatorLedger,
} from './creator-ledger.js';
import { DISTRICT_CONTRIBUTION, DISTRICT_ID } from './district-progress.js';

export const REALM_CHRONICLE_RECENT_LIMIT = 7;
export const REALM_CHRONICLE_MAX_ENTRIES = CREATOR_LEDGER_LIMIT;

const STAGE_BY_THRESHOLD = Object.freeze([
  Object.freeze({ minimum: 18, id: 'illuminated' }),
  Object.freeze({ minimum: 9, id: 'connected' }),
  Object.freeze({ minimum: 3, id: 'outpost' }),
  Object.freeze({ minimum: 0, id: 'locked' }),
]);

function freezeResult(value) {
  if (Array.isArray(value.entries)) {
    value.entries = Object.freeze(value.entries.map(entry => Object.freeze({
      ...entry,
      ...(entry.provenance ? { provenance: Object.freeze({ ...entry.provenance }) } : {}),
    })));
  }
  return Object.freeze(value);
}

function strictState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const restored = restoreCreatorLedger(value);
  return JSON.stringify(restored) === JSON.stringify(value) ? restored : null;
}

export function realmChronicleStageForEnergy(totalEnergy) {
  if (!Number.isInteger(totalEnergy)
    || totalEnergy < 0
    || totalEnergy > REALM_CHRONICLE_MAX_ENTRIES * DISTRICT_CONTRIBUTION
    || totalEnergy % DISTRICT_CONTRIBUTION !== 0) {
    return null;
  }
  return STAGE_BY_THRESHOLD.find(stage => totalEnergy >= stage.minimum)?.id ?? null;
}

export function deriveRealmChronicleFromState(state) {
  const restored = strictState(state);
  if (!restored) return freezeResult({ status: 'invalid' });
  if (restored.realms.length === 0) return freezeResult({ status: 'empty' });
  if (restored.realms.length !== 1) return freezeResult({ status: 'unavailable' });

  const realm = restored.realms[0];
  if (realm.districtId !== DISTRICT_ID) return freezeResult({ status: 'unavailable' });

  const entries = realm.receipts.map((entry, index) => {
    const totalEnergy = (index + 1) * DISTRICT_CONTRIBUTION;
    return {
      missionId: entry.missionId,
      roleId: entry.roleId,
      routeId: entry.routeId,
      contribution: DISTRICT_CONTRIBUTION,
      totalEnergy,
      stageId: realmChronicleStageForEnergy(totalEnergy),
      ...(entry.provenance ? {
        provenance: {
          sourceKind: entry.provenance.sourceKind,
          partnerName: entry.provenance.partnerName,
        },
      } : {}),
    };
  }).reverse();

  const stageId = realmChronicleStageForEnergy(realm.total);
  if (!stageId || entries.length !== realm.receipts.length || realm.total !== entries.length * DISTRICT_CONTRIBUTION) {
    return freezeResult({ status: 'invalid' });
  }

  return freezeResult({
    status: 'ready',
    districtId: DISTRICT_ID,
    contributionCount: entries.length,
    totalEnergy: realm.total,
    stageId,
    entries,
  });
}

export function deriveRealmChronicle(realm) {
  if (!realm || typeof realm !== 'object' || Array.isArray(realm)) {
    return freezeResult({ status: 'unavailable' });
  }
  return deriveRealmChronicleFromState({
    version: CREATOR_LEDGER_VERSION,
    realms: [realm],
  });
}
