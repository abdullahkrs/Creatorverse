import { webcrypto } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { buildLivingWorldUrl, createLivingWorldEvent } from '../src/living-world-event.js';
import { getLivingWorldCopy } from '../src/living-world-i18n.js';

let sequence = 9000;

function makeEvent({ progress = 15, target = 24 } = {}) {
  const suffix = String(sequence++).padStart(24, '0');
  return createLivingWorldEvent({ duration: '24h', target }, {
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

async function createContext(browser, locale = 'ar') {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(localeId => {
    localStorage.setItem('creatorverse-locale', localeId);
    window.__CREATORVERSE_LIVING_WORLD_WINDOW_MS__ = 1200;
    window.__CREATORVERSE_LIVING_WORLD_IMPACT_MS__ = 120;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
  }, locale);
  return context;
}

async function expectWithinViewport(page, locator, label) {
  await expect(locator, `${label}: visible`).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${label}: bounding box`).not.toBeNull();
  expect(box.x, `${label}: left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label}: top edge`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label}: right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label}: bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
  return box;
}

function boxesOverlap(first, second) {
  return !(
    first.x + first.width <= second.x
    || second.x + second.width <= first.x
    || first.y + first.height <= second.y
    || second.y + second.height <= first.y
  );
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-world][data-route="event"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 5000, polling: 'raf' });
}

async function completeContribution(page) {
  const root = page.locator('[data-living-world][data-route="event"]');
  const lock = page.locator('[data-living-world-lock]');
  await page.locator('[data-start-thread]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await lock.click();
  }
  await expect(root).toHaveAttribute('data-phase', 'complete', { timeout: 5000 });
}

test('320px at 200 percent keeps creator context and every utility inside the viewport without overlap', async ({ browser }) => {
  const context = await createContext(browser, 'ar');
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

  const creator = page.locator('.living-world-creator');
  const utilities = page.locator('.living-world-utilities');
  const emblem = page.locator('.living-world-emblem');
  const language = page.locator('.living-world-language');
  const sound = page.locator('[data-living-sound]');

  const creatorBox = await expectWithinViewport(page, creator, 'creator context');
  const utilitiesBox = await expectWithinViewport(page, utilities, 'utility row');
  await expectWithinViewport(page, emblem, 'creator emblem');
  await expectWithinViewport(page, language, 'language control');
  await expectWithinViewport(page, sound, 'sound control');
  expect(boxesOverlap(creatorBox, utilitiesBox), 'creator and utilities overlap').toBe(false);

  for (const button of await page.locator('.living-world-language button, .living-world-sound').all()) {
    const box = await button.boundingBox();
    expect(box?.width || 0, 'utility target width').toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, 'utility target height').toBeGreaterThanOrEqual(44);
  }

  const pageMetrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(pageMetrics.page - pageMetrics.viewport, 'page horizontal overflow').toBeLessThanOrEqual(1);

  const primary = page.locator('[data-start-thread]');
  await primary.scrollIntoViewIfNeeded();
  const primaryBox = await expectWithinViewport(page, primary, 'primary contribution action');
  expect(primaryBox.width).toBeGreaterThanOrEqual(44);
  expect(primaryBox.height).toBeGreaterThanOrEqual(44);

  await page.screenshot({
    path: 'test-results/living-world/ar-320x568-200-percent-release.png',
    fullPage: true,
  });
  await context.close();
});

test('collective completion shows one visual outcome, one impact, and one share action', async ({ browser }) => {
  const context = await createContext(browser, 'en');
  const page = await context.newPage();
  const copy = getLivingWorldCopy('en');
  await page.goto(eventUrl(makeEvent({ progress: 11, target: 12 })));
  await completeContribution(page);

  await expect(page.locator('.living-world-result-copy h2')).toHaveText(copy.result.complete);
  await expect(page.locator('.living-world-result-copy > p:not([data-living-status])')).toHaveText(copy.result.completeImpact);
  await expect(page.locator('[data-result-action="share"]')).toHaveText(copy.result.shareOpening);
  await expect(page.locator('.living-world-share-copy')).toBeHidden();

  const visibleOutcomeCount = await page.evaluate(text => [...document.querySelectorAll('h1, h2, strong')]
    .filter(element => element.textContent?.trim() === text && getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0)
    .length, copy.result.complete);
  expect(visibleOutcomeCount, 'visible completion outcome count').toBe(1);

  await page.screenshot({
    path: 'test-results/living-world/en-320x568-completed-release.png',
    fullPage: true,
  });
  await context.close();
});
