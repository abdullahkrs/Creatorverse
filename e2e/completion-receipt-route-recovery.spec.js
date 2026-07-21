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

test('a fresh invite route releases a settled receipt view without replaying progress', async ({ browser }) => {
  const ledger = savedRealmLedger();
  const receiptToken = duplicateReceiptToken();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ key, pendingKey, serializedLedger, token }) => {
    localStorage.setItem('creatorverse-locale', 'en');
    localStorage.setItem(key, serializedLedger);
    sessionStorage.setItem(pendingKey, JSON.stringify({ token }));
  }, {
    key: LEDGER_KEY,
    pendingKey: PENDING_RECEIPT_KEY,
    serializedLedger: JSON.stringify(ledger),
    token: receiptToken,
  });

  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('[data-completion-receipt-view]')).toBeVisible();
  await expect(page.locator('[data-action="import-completion-receipt"]')).toHaveCount(0);

  const now = Date.now();
  const inviteToken = createPrototypeInvite({
    name: 'Nova Guild',
    theme: 'cosmic',
    promise: '',
    missionId: 'relay-sequence',
    realmId: REALM_ID,
    missionInstanceId: 'mission_next0000001',
    scheduleId: 'now-1h',
    createdAtMinute: Math.floor(now / 60_000),
  }, { now });
  const baseUrl = await page.evaluate(() => `${window.location.origin}${window.location.pathname}`);
  const inviteUrl = buildPrototypeInviteUrl(baseUrl, inviteToken, { now });

  await page.goto(inviteUrl);

  await expect(page.locator('[data-completion-receipt-view]')).toHaveCount(0);
  await expect(page.locator('[data-prototype-follower-entry]')).toBeVisible();
  await expect(page.locator('[data-role="builder"]')).toBeVisible();
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), PENDING_RECEIPT_KEY)).toBeNull();

  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
  expect(after.total).toBe(3);
  expect(after.receipts).toHaveLength(1);
  await context.close();
});
