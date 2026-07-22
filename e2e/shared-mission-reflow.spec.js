import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  SHARED_MISSION_PROGRESS_KEY,
  createSharedMissionInvite,
  createSharedMissionReceipts,
} from '../src/shared-mission.js';

mkdirSync('test-results/shared-mission', { recursive: true });

const COLLAB_KEY = 'creatorverse-realm-collaboration-v1';
const LOCALE_KEY = 'creatorverse-locale';
const SOURCE = { id: 'realm_source_00000001', name: 'Signal Atlas', theme: 'cosmic' };
const LINKED = { id: 'realm_linked_00000002', name: 'Canopy Relay', theme: 'wild' };
const RELATIONSHIP_ID = 'proposal_000000000000000000000017';

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function completedFollowerState() {
  const collaboration = {
    version: 1,
    localRealmId: SOURCE.id,
    sourceRealmId: LINKED.id,
    proposalId: RELATIONSHIP_ID,
    sourceName: LINKED.name,
    sourceTheme: LINKED.theme,
  };
  const storage = memoryStorage([[COLLAB_KEY, JSON.stringify(collaboration)]]);
  const now = Date.now();
  const issued = createSharedMissionInvite(
    storage,
    SOURCE,
    collaboration,
    { missionId: 'route-choice', scheduleId: 'now-1h' },
    { now, cryptoLike: webcrypto, baseUrl: 'https://example.test/' },
  );
  expect(issued.status).toBe('ready');

  const result = createSharedMissionReceipts(
    issued.invite,
    { roleId: 'builder', routeId: 'sky' },
    { now, cryptoLike: webcrypto, baseUrl: 'https://example.test/' },
  );
  expect(result.status).toBe('ready');

  return {
    token: issued.token,
    progress: {
      version: 1,
      missionInstanceId: issued.invite.missionInstanceId,
      roleId: 'builder',
      step: 0,
      completed: true,
      routeId: 'sky',
      result: {
        completionId: result.completionId,
        receipts: result.receipts.map(({ targetRealmId, targetName, token, url }) => ({
          targetRealmId,
          targetName,
          token,
          url,
        })),
      },
    },
  };
}

test('320px shared mission keeps professional reflow at 200% text size', async ({ browser }) => {
  const state = completedFollowerState();
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(({ localeKey, progressKey, progress }) => {
    localStorage.setItem(localeKey, 'en');
    sessionStorage.setItem(progressKey, JSON.stringify(progress));
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  }, {
    localeKey: LOCALE_KEY,
    progressKey: SHARED_MISSION_PROGRESS_KEY,
    progress: state.progress,
  });

  const page = await context.newPage();
  await page.goto(`/#shared-mission=${state.token}`);
  await expect(page.locator('[data-shared-mission][data-state="complete"]')).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

  const metrics = await page.locator('[data-shared-mission]').evaluate(element => {
    const viewportWidth = document.documentElement.clientWidth;
    const card = element.getBoundingClientRect();
    const rectangle = node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, height: box.height };
    };
    return {
      viewportWidth,
      pageWidth: document.documentElement.scrollWidth,
      card: rectangle(element),
      factValues: [...element.querySelectorAll('.shared-mission-facts dd')].map(rectangle),
      realmNames: [...element.querySelectorAll('.shared-mission-realm strong')].map(rectangle),
      receiptActions: [...element.querySelectorAll('[data-action="share-shared-receipt"]')].map(rectangle),
    };
  });

  expect(metrics.pageWidth - metrics.viewportWidth, 'no horizontal page overflow').toBeLessThanOrEqual(1);
  expect(metrics.card.width, 'shared mission uses the mobile content width').toBeGreaterThanOrEqual(metrics.viewportWidth * 0.85);
  expect(metrics.card.left, 'card begins inside viewport').toBeGreaterThanOrEqual(0);
  expect(metrics.card.right, 'card ends inside viewport').toBeLessThanOrEqual(metrics.viewportWidth + 1);

  for (const value of [...metrics.factValues, ...metrics.realmNames]) {
    expect(value.width, 'essential text keeps a readable column').toBeGreaterThanOrEqual(metrics.card.width * 0.65);
    expect(value.left, 'essential text begins inside card').toBeGreaterThanOrEqual(metrics.card.left - 1);
    expect(value.right, 'essential text ends inside card').toBeLessThanOrEqual(metrics.card.right + 1);
  }

  expect(metrics.receiptActions).toHaveLength(2);
  for (const action of metrics.receiptActions) {
    expect(action.width, 'receipt action keeps usable width').toBeGreaterThanOrEqual(metrics.card.width * 0.65);
    expect(action.height, 'receipt action keeps minimum target height').toBeGreaterThanOrEqual(44);
    expect(action.left, 'receipt action begins inside viewport').toBeGreaterThanOrEqual(0);
    expect(action.right, 'receipt action ends inside viewport').toBeLessThanOrEqual(metrics.viewportWidth + 1);
  }

  await page.screenshot({
    path: 'test-results/shared-mission/en-320x568-200-percent-reflow.png',
    fullPage: true,
  });
  await context.close();
});
