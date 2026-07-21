import { test, expect } from '@playwright/test';

import { createPrototypeInvite } from '../src/prototype-invite.js';

const CREATED_MINUTE = Math.floor(Date.now() / 60_000);
const CREATED_MS = CREATED_MINUTE * 60_000;
const EXPIRED_MS = (CREATED_MINUTE + 1500) * 60_000;
const PROGRESS_KEYS = [
  'creatorverse-mission-template-state',
  'creatorverse-district-progress',
  'creatorverse-completion-receipt-id',
  'creatorverse-pending-completion-receipt',
];

function expiredInvite() {
  return createPrototypeInvite({
    name: 'QA Expired Realm',
    theme: 'cosmic',
    promise: 'A synthetic expired route.',
    missionId: 'route-choice',
    scheduleId: 'in-1h-24h',
    createdAtMinute: CREATED_MINUTE,
  }, { now: CREATED_MS });
}

async function createExpiredContext(browser, locale) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ selectedLocale, expiredNow }) => {
    localStorage.setItem('creatorverse-locale', selectedLocale);
    sessionStorage.setItem('creatorverse-schedule-test-now', String(expiredNow));
    Object.defineProperty(window, '__creatorverseMissionScheduleNow', {
      configurable: true,
      get: () => Number(sessionStorage.getItem('creatorverse-schedule-test-now')),
      set: value => sessionStorage.setItem('creatorverse-schedule-test-now', String(value)),
    });
  }, { selectedLocale: locale, expiredNow: EXPIRED_MS });
  return context;
}

async function expectNoMissionOutput(page) {
  await expect(page.locator('[data-mission-result]')).toHaveCount(0);
  await expect(page.locator('.signal-contribution')).toHaveCount(0);
  await expect(page.locator('[data-completion-receipt]')).toHaveCount(0);
}

for (const locale of ['en', 'ar']) {
  test(`${locale} expired invite exit restores the default realm and history remains fail closed`, async ({ browser }) => {
    const token = expiredInvite();
    const context = await createExpiredContext(browser, locale);
    const page = await context.newPage();

    await page.goto(`/#invite=${token}`);
    await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'expired');
    await expect(page.locator('.role-grid')).toBeHidden();
    await expect(page.getByText('QA Expired Realm')).toBeVisible();

    const restored = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-mission-window-status] a[href="#join"]').click();
    await restored;

    await expect(page).toHaveURL(/\/$/u);
    await expect(page.locator('[data-prototype-follower-entry]')).toHaveCount(0);
    await expect(page.getByText('QA Expired Realm')).toHaveCount(0);
    await expect(page.locator('.role-grid')).toBeVisible();
    await expectNoMissionOutput(page);
    expect(await page.evaluate(keys => keys.every(key => sessionStorage.getItem(key) == null), PROGRESS_KEYS)).toBe(true);

    await page.goto(`/#invite=${token}`);
    await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'expired');

    const directEditRecovery = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { window.location.hash = 'join'; });
    await directEditRecovery;
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByText('QA Expired Realm')).toHaveCount(0);
    await expectNoMissionOutput(page);

    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'expired');
    await expect(page.locator('.role-grid')).toBeHidden();

    await page.evaluate(() => {
      document.querySelector('[data-role="builder"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      document.querySelector('[data-mission-command]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      document.querySelector('[data-route]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.role-grid')).toBeHidden();
    await expectNoMissionOutput(page);

    await context.close();
  });
}
