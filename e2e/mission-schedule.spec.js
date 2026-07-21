import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { createPrototypeInvite } from '../src/prototype-invite.js';

mkdirSync('test-results/mission-schedule', { recursive: true });
test.setTimeout(90_000);

const CREATED_MINUTE = Math.floor(Date.now() / 60_000);
const CREATED_MS = CREATED_MINUTE * 60_000;
const ACTIVE_MS = (CREATED_MINUTE + 60) * 60_000;
const EXPIRED_MS = (CREATED_MINUTE + 1500) * 60_000;
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
    scheduleId: 'in-1h-24h',
    createdAtMinute: CREATED_MINUTE,
  }, { now: CREATED_MS });
}

async function createContext(browser, locale, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ selectedLocale, initialNow }) => {
    if (!localStorage.getItem('creatorverse-locale')) localStorage.setItem('creatorverse-locale', selectedLocale);
    if (!sessionStorage.getItem('creatorverse-schedule-test-now')) {
      sessionStorage.setItem('creatorverse-schedule-test-now', String(initialNow));
    }
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

async function assertTargets(page, label) {
  const targets = await page.locator('[data-mission-window-status] :is(button, a):visible, .mission-window-option:visible').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { text: node.textContent?.trim() || '', width: rect.width, height: rect.height };
  }));
  for (const target of targets) {
    expect(target.width, `${label} ${target.text} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${label} ${target.text} height`).toBeGreaterThanOrEqual(44);
  }
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
  test(`${locale} creator schedule selection survives locale and resize`, async ({ browser }) => {
    const context = await createContext(browser, locale, { width: 390, height: 844 });
    const page = await context.newPage();
    await page.goto('/');
    await page.locator('[data-action="creator"]').click();
    await page.locator('[data-action="creator-next"]').click();
    await page.locator('[data-action="creator-next"]').click();

    const options = page.locator('input[name="mission-schedule"]');
    await expect(options).toHaveCount(3);
    await expect(page.locator('input[name="mission-schedule"][value="now-1h"]')).toBeChecked();
    const first = page.locator('input[name="mission-schedule"][value="now-1h"]');
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('input[name="mission-schedule"][value="in-1h-24h"]')).toBeChecked();
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('input[name="mission-schedule"][value="in-1h-24h"]')).toBeChecked();
    await assertTargets(page, `${locale} creator selector`);
    await assertNoOverflow(page, `${locale} creator selector`);

    const otherLocale = locale === 'ar' ? 'en' : 'ar';
    await page.locator(`[data-locale="${otherLocale}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', otherLocale);
    await expect(page.locator('input[name="mission-schedule"][value="in-1h-24h"]')).toBeChecked();
    await context.close();
  });

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
      await expect(page.locator('[data-mission-window-status] time')).toHaveCount(1);
      await expect(page.locator('.role-grid')).toBeHidden();
      await expect(page.locator('[data-action="mission-schedule-recheck"]')).toBeEnabled();
      await expect(page.locator('[data-mission-result]')).toHaveCount(0);
      await assertTargets(page, `${locale} upcoming ${viewport.width}`);
      await assertNoOverflow(page, `${locale} upcoming ${viewport.width}`);
      await capture(page, locale, viewport, 'upcoming');

      await activate(page.locator('[data-action="mission-schedule-recheck"]'), keyboard);
      await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'upcoming');
      await expect(page.locator('[data-action="mission-schedule-recheck"]')).toBeEnabled();

      await advanceClock(page, ACTIVE_MS);
      await expect(page.locator('[data-mission-window-status]')).toHaveCount(0);
      await expect(page.locator('.role-grid')).toBeVisible();
      await expect(page.locator('[data-role]').first()).toBeFocused();
      await assertNoOverflow(page, `${locale} active ${viewport.width}`);
      await capture(page, locale, viewport, 'active');
      if (viewport.width === 390) await assertAxe(page, `${locale} active`);

      await completeMission(page, templateId, keyboard);
      await expect(page.locator('.signal-contribution')).toContainText('+3');

      await advanceClock(page, EXPIRED_MS);
      await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'expired');
      await expect(page.locator('.role-grid')).toBeHidden();
      await expect(page.locator('[data-mission-result]')).toHaveCount(0);
      await expect(page.locator('#mission-window-title')).toBeFocused();
      await assertTargets(page, `${locale} expired ${viewport.width}`);
      await assertNoOverflow(page, `${locale} expired ${viewport.width}`);
      await capture(page, locale, viewport, 'expired');

      await page.reload();
      await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'expired');
      await expect(page.locator('.role-grid')).toBeHidden();

      if (viewport.width === 390) {
        await advanceClock(page, CREATED_MS);
        await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'upcoming');
        await assertAxe(page, `${locale} upcoming`);
        await advanceClock(page, EXPIRED_MS);
        await assertAxe(page, `${locale} expired`);
      }

      if (viewport.width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await assertNoOverflow(page, `${locale} 200% zoom`);
      }

      if (viewport.width === 768) {
        const otherLocale = locale === 'ar' ? 'en' : 'ar';
        await page.locator(`[data-locale="${otherLocale}"]`).click();
        await expect(page.locator('html')).toHaveAttribute('lang', otherLocale);
        await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'expired');
        await page.locator(`[data-locale="${locale}"]`).click();
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('[data-mission-window-status]')).toHaveAttribute('data-state', 'expired');
      }

      await context.close();
    });
  }
}
