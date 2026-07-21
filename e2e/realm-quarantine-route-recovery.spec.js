import { test, expect } from '@playwright/test';

import { createPrototypeInvite } from '../src/prototype-invite.js';

const CREATED_MINUTE = Math.floor(Date.now() / 60_000);
const CREATED_MS = CREATED_MINUTE * 60_000;
const REALM_A = 'Realm_A000000000000001';
const REALM_B = 'Realm_B000000000000002';

function inviteFor(realmId, name) {
  return createPrototypeInvite({
    name,
    theme: 'cosmic',
    promise: 'Build one calm fictional signal.',
    missionId: 'route-choice',
    realmId,
    scheduleId: 'now-24h',
    createdAtMinute: CREATED_MINUTE,
  }, { now: CREATED_MS });
}

async function hideCurrentRealm(page) {
  await page.locator('[data-action="open-realm-safety"]').click();
  await page.locator('input[name="realm-quarantine-reason"][value="unsafe-real-world"]').check();
  await page.locator('[data-action="confirm-realm-quarantine"]').click();
  await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
}

for (const locale of ['en', 'ar']) {
  test(`${locale} unblocked same-tab invites rebuild the base follower experience`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(selectedLocale => {
      localStorage.setItem('creatorverse-locale', selectedLocale);
      const count = Number(sessionStorage.getItem('creatorverse-route-recovery-loads') || '0');
      sessionStorage.setItem('creatorverse-route-recovery-loads', String(count + 1));
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => {} },
      });
    }, locale);

    const page = await context.newPage();
    const tokenA = inviteFor(REALM_A, 'Harbor Guild');
    const tokenB = inviteFor(REALM_B, 'Canopy Relay');

    await page.goto(`/#invite=${tokenA}`);
    await hideCurrentRealm(page);

    await page.evaluate(token => { window.location.hash = `invite=${token}`; }, tokenB);
    await expect(page.locator('[data-prototype-follower-entry]')).toContainText('Canopy Relay');
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveCount(0);
    await expect(page.locator('[data-action="open-realm-safety"]')).toBeVisible();
    await expect(page.locator('[data-role]')).toHaveCount(3);
    await expect(page.locator('[data-mission-result]')).toHaveCount(0);
    await expect(page.locator('[data-completion-receipt]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem('creatorverse-route-recovery-loads')))).toBeGreaterThan(1);

    await page.goto(`/#invite=${tokenA}`);
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
    await page.locator('[data-action="show-realm-again"]').click();
    await page.locator('[data-action="confirm-realm-restore"]').click();
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'restored');

    const loadsBeforeRestoreRoute = await page.evaluate(() => Number(sessionStorage.getItem('creatorverse-route-recovery-loads')));
    await page.evaluate(token => { window.location.hash = `invite=${token}`; }, tokenA);
    await expect(page.locator('[data-prototype-follower-entry]')).toContainText('Harbor Guild');
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveCount(0);
    await expect(page.locator('[data-action="open-realm-safety"]')).toBeVisible();
    await expect(page.locator('[data-role]')).toHaveCount(3);
    await expect(page.locator('[data-mission-result]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem('creatorverse-route-recovery-loads')))).toBeGreaterThan(loadsBeforeRestoreRoute);

    await context.close();
  });
}
