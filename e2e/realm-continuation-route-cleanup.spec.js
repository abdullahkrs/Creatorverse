import { test, expect } from '@playwright/test';
import { createCompletionReceipt } from '../src/completion-receipt.js';

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
