import { test, expect } from '@playwright/test';

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const REALM_ID = 'realm_abcdefghijklmnop';

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
        id: 'receipt_seed0000000001',
        missionId: 'route-choice',
        roleId: 'builder',
        routeId: 'sky',
        districtId: 'beacon-district',
        contribution: 3,
      }],
    }],
  };
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
