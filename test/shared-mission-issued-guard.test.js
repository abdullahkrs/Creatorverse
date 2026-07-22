import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCreatorRealm } from '../src/creator-ledger.js';
import { REALM_COLLABORATION_KEY } from '../src/realm-collaboration.js';
import {
  SHARED_MISSION_ISSUED_KEY,
  createSharedMissionInvite,
} from '../src/shared-mission.js';
import {
  inspectIssuedSharedMissionBinding,
  isIssuedSharedMissionBoundToContext,
} from '../src/shared-mission-issued-guard.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function deterministicCrypto(start = 1) {
  let counter = start;
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = (counter + index) % 256;
      counter += bytes.length + 1;
      return bytes;
    },
  };
}

const NOW = Date.UTC(2026, 6, 22, 5, 0, 0);
const A = { id: 'realm_A_0000000000000001', name: 'North Signal', theme: 'cosmic' };
const B = { id: 'realm_B_0000000000000002', name: 'Green Relay', theme: 'wild' };
const C = { id: 'realm_C_0000000000000003', name: 'Future Arc', theme: 'future' };

function collaboration(local, source, proposalId) {
  return {
    version: 1,
    localRealmId: local.id,
    sourceRealmId: source.id,
    proposalId,
    sourceName: source.name,
    sourceTheme: source.theme,
  };
}

function createIssuedFixture() {
  const localStore = new MemoryStorage();
  const sessionStore = new MemoryStorage();
  const link = collaboration(A, B, 'proposal_000000000000000000000001');
  saveCreatorRealm(localStore, { realmId: A.id, name: A.name, theme: A.theme });
  localStore.setItem(REALM_COLLABORATION_KEY, JSON.stringify(link));
  const issued = createSharedMissionInvite(localStore, A, link, {
    missionId: 'route-choice',
    scheduleId: 'now-1h',
  }, {
    now: NOW,
    cryptoLike: deterministicCrypto(),
    baseUrl: 'https://preview.example.test/app',
  });
  assert.equal(issued.status, 'ready');
  sessionStore.setItem(SHARED_MISSION_ISSUED_KEY, JSON.stringify(issued.invite));
  return { localStore, sessionStore, link, invite: issued.invite };
}

test('issued shared mission remains usable only for its exact current collaboration', () => {
  const fixture = createIssuedFixture();
  assert.equal(isIssuedSharedMissionBoundToContext(fixture.invite, A, fixture.link), true);
  assert.equal(inspectIssuedSharedMissionBinding(fixture.localStore, fixture.sessionStore).status, 'ready');

  const replacement = collaboration(A, C, 'proposal_000000000000000000000002');
  fixture.localStore.setItem(REALM_COLLABORATION_KEY, JSON.stringify(replacement));
  assert.equal(isIssuedSharedMissionBoundToContext(fixture.invite, A, replacement), false);
  assert.equal(inspectIssuedSharedMissionBinding(fixture.localStore, fixture.sessionStore).status, 'stale');
});

test('removed, malformed, or missing creator context invalidates issued shared mission state', () => {
  const fixture = createIssuedFixture();

  fixture.localStore.removeItem(REALM_COLLABORATION_KEY);
  assert.equal(inspectIssuedSharedMissionBinding(fixture.localStore, fixture.sessionStore).status, 'stale');

  fixture.localStore.setItem(REALM_COLLABORATION_KEY, '{bad');
  assert.equal(inspectIssuedSharedMissionBinding(fixture.localStore, fixture.sessionStore).status, 'stale');

  fixture.sessionStore.setItem(SHARED_MISSION_ISSUED_KEY, '{bad');
  assert.equal(inspectIssuedSharedMissionBinding(fixture.localStore, fixture.sessionStore).status, 'stale');

  fixture.sessionStore.removeItem(SHARED_MISSION_ISSUED_KEY);
  assert.equal(inspectIssuedSharedMissionBinding(fixture.localStore, fixture.sessionStore).status, 'none');
});
