import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildLivingWorldUrl, createLivingWorldEvent, LIVING_WORLD_STORAGE_KEY } from '../src/living-world-event.js';
import { getLivingWorldCopy } from '../src/living-world-i18n.js';

mkdirSync('test-results/living-world', { recursive: true });
test.setTimeout(240_000);

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr' },
  { id: 'ar', dir: 'rtl' },
];
let sequence = 1;

function makeEvent({ progress = 15, target = 24, duration = '24h' } = {}) {
  const suffix = String(sequence++).padStart(24, '0');
  return createLivingWorldEvent({ duration, target }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    eventId: `event_${suffix}`,
    creatorName: 'Noura',
    progress,
  });
}

function eventUrl(value) {
  const absolute = buildLivingWorldUrl(value, { baseUrl: 'https://example.test/' });
  return `/${new URL(absolute).hash}`;
}

async function createContext(browser, { locale = 'en', viewport = VIEWPORTS[1], reducedMotion = 'no-preference', audio = true, storageFailure = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.addInitScript(({ localeId, audioEnabled, failStorage }) => {
    localStorage.setItem('creatorverse-locale', localeId);
    window.__CREATORVERSE_LIVING_WORLD_WINDOW_MS__ = 1200;
    window.__CREATORVERSE_LIVING_WORLD_IMPACT_MS__ = 500;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { sessionStorage.setItem('__living_world_clipboard', value); } },
    });
    if (!audioEnabled) {
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
    }
    if (failStorage) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'creatorverse-living-world-v1') throw new Error('CONTROLLED_STORAGE_FAILURE');
        return original.call(this, key, value);
      };
    }
  }, { localeId: locale, audioEnabled: audio, failStorage: storageFailure });
  return context;
}

async function noBlockingAxe(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(blocking, `${label}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

async function expectQuality(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(metrics.page - metrics.viewport, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('.living-world-primary:visible').last();
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box?.width || 0, `${label}: primary width`).toBeGreaterThanOrEqual(44);
  expect(box?.height || 0, `${label}: primary height`).toBeGreaterThanOrEqual(44);
  await noBlockingAxe(page, label);
}

async function waitForNotch(page, index) {
  const root = page.locator('[data-living-world][data-route="event"]');
  await expect(root).toHaveAttribute('data-window-index', String(index), { timeout: 5000 });
  await expect(root).toHaveAttribute('data-notch-active', 'true', { timeout: 5000 });
}

async function completeContribution(page, { screenshots = null, finalPhase = /result|complete/u } = {}) {
  const root = page.locator('[data-living-world][data-route="event"]');
  await page.locator('[data-start-thread]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  await waitForNotch(page, 0);
  if (screenshots) await page.screenshot({ path: screenshots.first, fullPage: true });
  await page.locator('[data-living-world-lock]').click();
  await waitForNotch(page, 1);
  await page.locator('[data-living-world-lock]').click();
  await waitForNotch(page, 2);
  if (screenshots) await page.screenshot({ path: screenshots.third, fullPage: true });
  await page.locator('[data-living-world-lock]').click();
  if (finalPhase === 'storage-error') {
    await expect(root).toHaveAttribute('data-phase', 'storage-error', { timeout: 5000 });
    return;
  }
  await expect(root).toHaveAttribute('data-phase', 'impact', { timeout: 5000 });
  if (screenshots) await page.screenshot({ path: screenshots.impact, fullPage: true });
  await expect(root).toHaveAttribute('data-phase', finalPhase, { timeout: 5000 });
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} living world contribution produces responsive exact-once impact`, async ({ browser }) => {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      const value = makeEvent();
      const prefix = `test-results/living-world/${locale.id}-${viewport.width}x${viewport.height}`;
      await page.goto(eventUrl(value));

      const root = page.locator('[data-living-world][data-route="event"]');
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(root).toHaveAttribute('data-phase', 'ready');
      await expect(page.locator('.folded-horizon')).toBeVisible();
      await expect(page.locator('[data-start-thread]')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/ledger|receipt|import|provenance|dashboard|leaderboard|sync/iu);
      await page.screenshot({ path: `${prefix}-world-ready.png`, fullPage: true });
      await expectQuality(page, `${locale.id}-${viewport.width}-ready`);

      await completeContribution(page, {
        screenshots: {
          first: `${prefix}-active-first-window.png`,
          third: `${prefix}-active-third-window.png`,
          impact: `${prefix}-energy-impact.png`,
        },
      });

      await expect(page.locator('.loom-slat.is-woven')).toHaveCount(8);
      await expect(page.locator('[data-share-composition]')).toBeVisible();
      await page.screenshot({ path: `${prefix}-partial-progress-share.png`, fullPage: true });
      await expectQuality(page, `${locale.id}-${viewport.width}-result`);

      const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LIVING_WORLD_STORAGE_KEY);
      expect(stored.events[0].progress).toBe(16);
      await page.reload();
      await expect(root).toHaveAttribute('data-phase', 'duplicate');
      const afterReload = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LIVING_WORLD_STORAGE_KEY);
      expect(afterReload.events[0].progress).toBe(16);
      await context.close();
    });
  }
}

test('share update opens the same bounded event snapshot in a fresh context', async ({ browser }) => {
  const first = await createContext(browser, { locale: 'en' });
  const page = await first.newPage();
  await page.goto(eventUrl(makeEvent({ progress: 5, target: 12 })));
  await completeContribution(page);
  await page.locator('[data-result-action="share"]').click();
  await expect(page.locator('[data-living-status]')).toHaveText(getLivingWorldCopy('en').share.copied);
  const copied = await page.evaluate(() => sessionStorage.getItem('__living_world_clipboard'));
  expect(copied).toContain('#world-event=');

  const second = await createContext(browser, { locale: 'ar' });
  const friend = await second.newPage();
  await friend.goto(copied);
  await expect(friend.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(friend.locator('[data-living-world]')).toHaveAttribute('data-phase', 'ready');
  await expect(friend.locator('.living-world-progress strong')).toContainText('٦ / ١٢');
  await first.close();
  await second.close();
});

for (const locale of LOCALES) {
  test(`${locale.id} collective completion opens the far shore`, async ({ browser }) => {
    const context = await createContext(browser, { locale: locale.id, viewport: VIEWPORTS[1] });
    const page = await context.newPage();
    await page.goto(eventUrl(makeEvent({ progress: 11, target: 12 })));
    await completeContribution(page);
    await expect(page.locator('[data-living-world]')).toHaveAttribute('data-phase', 'complete');
    await expect(page.locator('.folded-horizon')).toHaveClass(/is-complete/u);
    await expect(page.locator('.loom-slat.is-woven')).toHaveCount(12);
    await page.screenshot({ path: `test-results/living-world/${locale.id}-390x844-completed-world.png`, fullPage: true });
    await expectQuality(page, `${locale.id}-completed`);
    await context.close();
  });

  test(`${locale.id} compact creator launch stays world-first`, async ({ browser }) => {
    const context = await createContext(browser, { locale: locale.id, viewport: VIEWPORTS[1] });
    const page = await context.newPage();
    await page.goto('/#living-world-launch');
    await expect(page.locator('[data-living-world][data-route="launch"]')).toBeVisible();
    await expect(page.locator('[data-living-launch]')).toBeVisible();
    await expect(page.locator('.folded-horizon')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/analytics|participants|receipt|ledger|dashboard/iu);
    await page.screenshot({ path: `test-results/living-world/${locale.id}-390x844-creator-launch.png`, fullPage: true });
    await page.locator('[data-launch-target="12"]').click();
    await page.locator('[data-living-launch]').click();
    await expect(page.locator('[data-living-share]')).toBeVisible();
    await expectQuality(page, `${locale.id}-creator-live`);
    await context.close();
  });

  test(`${locale.id} invalid link fails closed without reflected content`, async ({ browser }) => {
    const context = await createContext(browser, { locale: locale.id, viewport: VIEWPORTS[0] });
    const page = await context.newPage();
    await page.goto('/#world-event=hostile%3Cscript%3E');
    await expect(page.locator('[data-living-world][data-route="recovery"]')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('hostile');
    await page.screenshot({ path: `test-results/living-world/${locale.id}-320x568-invalid-recovery.png`, fullPage: true });
    await expectQuality(page, `${locale.id}-invalid`);
    await context.close();
  });
}

test('keyboard path, reduced motion, and muted sound preserve the contribution meaning', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent({ progress: 2, target: 12 })));
  await expect(page.locator('[data-living-sound]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-start-thread]').focus();
  await page.keyboard.press('Enter');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await page.keyboard.press('Space');
  }
  await expect(page.locator('[data-living-world]')).toHaveAttribute('data-phase', /result|complete/u, { timeout: 5000 });
  await expectQuality(page, 'keyboard-reduced-motion');
  await context.close();
});

test('failed attempt offers retry without changing collective progress', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en' });
  const page = await context.newPage();
  const value = makeEvent({ progress: 7 });
  await page.goto(eventUrl(value));
  await page.locator('[data-start-thread]').click();
  await expect(page.locator('[data-living-world]')).toHaveAttribute('data-phase', 'failed', { timeout: 7000 });
  await expect(page.locator('[data-result-action="retry"]')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY)).toBeNull();
  await page.screenshot({ path: 'test-results/living-world/en-390x844-failed-retry.png', fullPage: true });
  await context.close();
});

test('storage failure preserves the previous world and exposes one safe retry', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en', storageFailure: true });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent({ progress: 7 })));
  await completeContribution(page, { finalPhase: 'storage-error' });
  await expect(page.locator('[data-result-action="retry"]')).toBeVisible();
  await expect(page.locator('.living-world-progress strong')).toContainText('7 / 24');
  await context.close();
});

test('an event expiring during active contribution exits to a safe retry state', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en' });
  const page = await context.newPage();
  const value = { ...makeEvent({ progress: 7 }), expiresAt: Date.now() + 3200 };
  await page.goto(eventUrl(value));
  await completeContribution(page, { finalPhase: 'storage-error' });
  await expect(page.locator('[data-result-action="retry"]')).toBeVisible();
  await expect(page.locator('.living-world-progress strong')).toContainText('7 / 24');
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY)).toBeNull();
  await context.close();
});

test('320px at 200 percent text zoom keeps the world and primary action usable', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[0], reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.locator('[data-start-thread]')).toBeVisible();
  await expectQuality(page, 'ar-320-200-percent');
  await page.screenshot({ path: 'test-results/living-world/ar-320x568-200-percent.png', fullPage: true });
  await context.close();
});

test('unsupported audio disables only sound while the world remains functional', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en', audio: false });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await expect(page.locator('[data-living-sound]')).toBeDisabled();
  await expect(page.locator('[data-start-thread]')).toBeEnabled();
  await context.close();
});
