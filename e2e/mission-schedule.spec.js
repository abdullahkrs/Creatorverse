import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { createPrototypeInvite } from '../src/prototype-invite.js';

mkdirSync('test-results/mission-schedule', { recursive: true });
test.setTimeout(90_000);

const CREATED_MINUTE = 30_000_000;
const CREATED_MS = CREATED_MINUTE * 60_000;
const ACTIVE_MS = (CREATED_MINUTE + 60) * 60_000;
const ENDED_MS = (CREATED_MINUTE + 90) * 60_000;
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const TEMPLATES = ['route-choice', 'relay-sequence', 'signal-match'];

function inviteFor(templateId) {
  return createPrototypeInvite({
    name: 'Nova Guild',
    theme: 'cosmic',
    promise: 'Build a calm fictional signal.',
    missionId: templateId,
    scheduleId: 'in-1h-30m',
    createdAtMinute: CREATED_MINUTE,
  }, { now: CREATED_MS });
}

async function createContext(browser, locale, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ selectedLocale, initialNow }) => {
    localStorage.setItem('creatorverse-locale', selectedLocale);
    sessionStorage.setItem('creatorverse-schedule-test-now', String(initialNow));
    Object.defineProperty(window, '__creatorverseMissionScheduleNow', {
      configurable: true,
      get: () => Number(sessionStorage.getItem('creatorverse-schedule-test-now')),
      set: value => sessionStorage.setItem('creatorverse-schedule-test-now', String(value)),
    });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__missionScheduleClipboard = String(value); } },
    });
  }, { selectedLocale: locale, initialNow: CREATED_MS });
  return context;
}

async function advanceClock(page, value) {
  await page.evaluate(nextNow => {
    window.__creatorverseMissionScheduleNow = nextNow;
    window.dispatchEvent(new Event('creatorverse:schedule-clock'));
  }, value);
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
}

async function assertAxe(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function capture(page, locale, viewport, state) {
  await page.screenshot({
    path: `test-results/mission-schedule/${locale}-${viewport.width}x${viewport.height}-${state}.png`,
    fullPage: true,
  });
}

async function activate(locator, keyboard) {
  await locator.scrollIntoViewIfNeeded();
  if (keyboard) {
    await locator.focus();
    await locator.press('Enter');
  } else {
    await locator.click();
  }
}

async function completeMission(page, templateId, keyboard) {
  await activate(page.locator('[data-role="builder"]'), keyboard);
  if (templateId === 'route-choice') {
    await activate(page.locator('[data-mission-command="sky"]'), keyboard);
  } else if (templateId === 'relay-sequence') {
    for (const step of ['1', '2', '3']) {
      await activate(page.locator(`[data-mission-command="${step}"]`), keyboard);
    }
  } else {
    await activate(page.locator('[data-mission-command="wave"]'), keyboard);
  }
  await expect(page.locator('[data-mission-result]')).toBeVisible();
  await expect(page.locator('.signal-contribution')).toContainText('+3');
  await expect(page.locator('[data-district-progress]')).toHaveAttribute('aria-valuenow', '3');
}

for (const locale of ['en', 'ar']) {
  for (const [index, viewport] of VIEWPORTS.entries()) {
    const templateId = TEMPLATES[index % TEMPLATES.length];
    const keyboard = index % 2 === 0;
    test(`${locale} scheduled ${templateId} at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await createContext(browser, locale, viewport);
      const page = await context.newPage();
      await page.goto(`/#invite=${inviteFor(templateId)}`);

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'upcoming');
      await expect(page.locator('.role-grid')).toBeHidden();
      await expect(page.locator('[data-mission-window-status] button[disabled]')).toBeVisible();
      await expect(page.locator('[data-mission-result]')).toHaveCount(0);
      await assertNoOverflow(page, `${locale} upcoming ${viewport.width}`);
      await capture(page, locale, viewport, 'upcoming');

      await advanceClock(page, ACTIVE_MS);
      await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'active');
      await expect(page.locator('.role-grid')).toBeVisible();
      await completeMission(page, templateId, keyboard);
      await assertNoOverflow(page, `${locale} active ${viewport.width}`);
      await capture(page, locale, viewport, 'active-complete');

      await advanceClock(page, ENDED_MS);
      await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'ended');
      await expect(page.locator('.role-grid')).toBeHidden();
      await expect(page.locator('[data-mission-result]')).toHaveCount(0);
      await expect(page.locator('#mission-window-title')).toBeFocused();
      await assertNoOverflow(page, `${locale} ended ${viewport.width}`);
      await capture(page, locale, viewport, 'ended');

      await page.reload();
      await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'ended');
      await expect(page.locator('.role-grid')).toBeHidden();

      if (viewport.width === 390) {
        for (const stateNow of [CREATED_MS, ACTIVE_MS, ENDED_MS]) {
          await advanceClock(page, stateNow);
          await assertAxe(page, `${locale} ${stateNow}`);
        }
      }

      if (viewport.width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await assertNoOverflow(page, `${locale} 200% zoom`);
      }

      if (viewport.width === 768) {
        const otherLocale = locale === 'ar' ? 'en' : 'ar';
        await page.locator(`[data-locale="${otherLocale}"]`).click();
        await expect(page.locator('html')).toHaveAttribute('lang', otherLocale);
        await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'ended');
        await page.locator(`[data-locale="${locale}"]`).click();
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'ended');
      }

      await context.close();
    });
  }
}
