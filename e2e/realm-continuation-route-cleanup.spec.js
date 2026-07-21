import { test, expect } from '@playwright/test';
import { createCompletionReceipt } from '../src/completion-receipt.js';
import { buildPrototypeInviteUrl, createPrototypeInvite } from '../src/prototype-invite.js';

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const PENDING_RECEIPT_KEY = 'creatorverse-pending-completion-receipt';
const REALM_ID = 'realm_abcdefghijklmnop';
const RECEIPT_ID = 'receipt_seed0000000001';

function savedRealmLedger() {
  return {
    version: 1,
    realms: [{
      id: REALM_ID,
      name: 'Nova Guild',
      theme: 'cosmic',
      total: 3,
      districtId: 'beacon-district',
      unlocked: true,
      receipts: [{
        id: RECEIPT_ID,
        missionId: 'route-choice',
        roleId: 'builder',
        routeId: 'sky',
        districtId: 'beacon-district',
        contribution: 3,
      }],
    }],
  };
}

function duplicateReceiptToken() {
  return createCompletionReceipt({
    realmId: REALM_ID,
    receiptId: RECEIPT_ID,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    districtId: 'beacon-district',
    contribution: 3,
  });
}

test('invite to receipt navigation preserves the receipt handoff and removes stale continuation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ key, ledger }) => {
    localStorage.setItem('creatorverse-locale', 'en');
    localStorage.setItem(key, JSON.stringify(ledger));
  }, { key: LEDGER_KEY, ledger: savedRealmLedger() });

  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('main > [data-realm-continuation]')).toHaveAttribute('data-state', 'ready');

  await page.evaluate(() => {
    window.location.hash = '#invite=invalid';
  });
  await expect(page.locator('[data-prototype-invite-error]')).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = '#receipt=invalid';
  });

  await expect(page.locator('main > [data-realm-continuation]')).toHaveCount(0);
  await expect(page.locator('[data-completion-receipt-view]')).toBeVisible();
  await context.close();
});

test('duplicate receipt restoration exposes the same-realm continuation without replaying +3', async ({ browser }) => {
  const ledger = savedRealmLedger();
  const token = duplicateReceiptToken();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ key, pendingKey, serializedLedger, receiptToken }) => {
    localStorage.setItem('creatorverse-locale', 'en');
    localStorage.setItem(key, serializedLedger);
    sessionStorage.setItem(pendingKey, JSON.stringify({ token: receiptToken }));
  }, {
    key: LEDGER_KEY,
    pendingKey: PENDING_RECEIPT_KEY,
    serializedLedger: JSON.stringify(ledger),
    receiptToken: token,
  });

  const page = await context.newPage();
  await page.goto('/');

  await expect(page.locator('[data-completion-receipt-view]')).toBeVisible();
  await expect(page.locator('[data-action="import-completion-receipt"]')).toHaveCount(0);
  const continuation = page.locator('.completion-record [data-realm-continuation]');
  await expect(continuation).toHaveAttribute('data-state', 'ready');
  await expect(continuation).toBeVisible();
  await expect(continuation.locator('[data-action="open-realm-continuation"]')).toBeVisible();

  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
  expect(after.total).toBe(3);
  expect(after.receipts).toHaveLength(1);
  await context.close();
});

test('invite-to-invite navigation reloads and resets the follower mission template context', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem('creatorverse-locale', 'en'));
  const page = await context.newPage();
  await page.goto('/');

  const baseUrl = await page.evaluate(() => `${window.location.origin}${window.location.pathname}`);
  const now = Date.now();
  const createdAtMinute = Math.floor(now / 60_000);
  const firstToken = createPrototypeInvite({
    name: 'Nova Guild',
    theme: 'cosmic',
    promise: '',
    missionId: 'relay-sequence',
    realmId: REALM_ID,
    missionInstanceId: 'mission_relay00001',
    scheduleId: 'now-24h',
    createdAtMinute,
  }, { now });
  const secondToken = createPrototypeInvite({
    name: 'Nova Guild',
    theme: 'cosmic',
    promise: '',
    missionId: 'signal-match',
    realmId: REALM_ID,
    missionInstanceId: 'mission_signal0001',
    scheduleId: 'now-24h',
    createdAtMinute,
  }, { now });
  const firstUrl = buildPrototypeInviteUrl(baseUrl, firstToken, { now });
  const secondUrl = buildPrototypeInviteUrl(baseUrl, secondToken, { now });

  await page.goto(firstUrl);
  await expect(page.locator('#mission-title')).toHaveText('Link the Relays');
  await page.locator('[data-role="builder"]').click();
  await page.locator('[data-mission-command="1"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(
    sessionStorage.getItem('creatorverse-mission-template-state'),
  ).step)).toBe(1);

  const reloaded = page.waitForEvent('load');
  await page.evaluate(hash => {
    window.location.hash = hash;
  }, new URL(secondUrl).hash);
  await reloaded;

  await expect(page.locator('#mission-title')).toHaveText('Match the Signal');
  await expect(page.locator('[data-mission-command="wave"]')).toBeVisible();
  await expect(page.locator('[data-mission-command="2"]')).toHaveCount(0);
  await expect(page.locator('[data-mission-result]')).toHaveCount(0);
  const restored = await page.evaluate(() => ({
    missionTemplateId: globalThis.__creatorverseMissionTemplateId,
    missionInstanceId: globalThis.__creatorverseMissionInstanceId,
  }));
  expect(restored.missionTemplateId).toBe('signal-match');
  expect(restored.missionInstanceId).toBe('mission_signal0001');
  await context.close();
});
