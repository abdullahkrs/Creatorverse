import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createLivingWorldEvent } from '../src/living-world-event.js';
import { createLivingWorldChapter } from '../src/living-world-chapter.js';
import {
  buildLivingWorldLightRelayUrl,
  createLivingWorldLightRelay,
} from '../src/living-world-light-relay.js';

const OUTPUT = 'test-results/living-world-light-relay-focus';
const LOCALE_KEY = 'creatorverse-locale';
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

mkdirSync(OUTPUT, { recursive: true });
test.setTimeout(240_000);
let sequence = 180000;

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}

function makeChapter(progress = 3) {
  const predecessor = createLivingWorldEvent({ duration: '24h', target: 12 }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
  return createLivingWorldChapter(predecessor, { duration: '24h' }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress,
  });
}

function relayUrl(relay) {
  return `/${new URL(buildLivingWorldLightRelayUrl(relay, { baseUrl: 'https://example.test/' })).hash}`;
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  reducedMotion = 'no-preference',
  hasTouch = true,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch });
  await context.addInitScript(({ localeId, localeKey }) => {
    localStorage.setItem(localeKey, localeId);
    window.__CREATORVERSE_RELAY_WINDOW_MS__ = 500;
    window.__CREATORVERSE_RELAY_IMPACT_MS__ = 1400;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
  }, { localeId: locale, localeKey: LOCALE_KEY });
  return context;
}

function intersects(inner, outer) {
  return inner.right > outer.left
    && inner.left < outer.right
    && inner.bottom > outer.top
    && inner.top < outer.bottom;
}

async function geometry(page, label) {
  const result = await page.evaluate(() => {
    const rect = element => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const world = document.querySelector('[data-light-relay-world]');
    const target = document.querySelector('[data-light-relay-target="true"] .lantern-core');
    const action = document.querySelector('.chapter-primary');
    const creator = document.querySelector('.chapter-creator-strip');
    const title = document.querySelector('.light-relay-title-block');
    const utilities = document.querySelector('.chapter-utilities');
    const active = [...document.querySelectorAll('[data-lantern-state="active"]')].map(rect);
    const dormant = [...document.querySelectorAll('[data-lantern-state="dormant"]')].map(rect);
    const bridge = [...document.querySelectorAll('.chapter-bridge-slat')].map(rect);
    const strand = document.querySelector('[data-light-relay-strand="unfinished"]');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      world: rect(world),
      target: rect(target),
      action: rect(action),
      creator: rect(creator),
      title: rect(title),
      utilities: rect(utilities),
      active,
      dormant,
      bridge,
      strand: rect(strand),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      targetState: document.querySelector('[data-light-relay-target="true"]')?.dataset.lanternState,
      targetRings: document.querySelectorAll('[data-light-relay-target="true"] .lantern-inner-ring').length,
      viewBox: world.getAttribute('viewBox'),
      camera: world.dataset.relayCamera,
    };
  });

  const targetCenterX = result.target.left + result.target.width / 2;
  const targetCenterY = result.target.top + result.target.height / 2;
  const inlineRatio = (targetCenterX - result.world.left) / result.world.width;
  const blockRatio = (targetCenterY - result.world.top) / result.world.height;

  expect(result.camera, `${label}: authored camera`).toBe('target');
  expect(result.viewBox, `${label}: viewBox`).not.toBe('0 0 800 560');
  expect(result.overflow, `${label}: overflow`).toBeLessThanOrEqual(1);
  expect((result.world.width * result.world.height) / (result.viewport.width * result.viewport.height), `${label}: world area`).toBeGreaterThanOrEqual(0.98);
  expect(inlineRatio, `${label}: target inline`).toBeGreaterThanOrEqual(0.58);
  expect(inlineRatio, `${label}: target inline`).toBeLessThanOrEqual(0.82);
  expect(blockRatio, `${label}: target block`).toBeGreaterThanOrEqual(0.36);
  expect(blockRatio, `${label}: target block`).toBeLessThanOrEqual(0.56);
  expect(result.targetState, `${label}: target state`).toBe('target');
  expect(result.targetRings, `${label}: target inner ring`).toBe(1);
  expect(result.action.width, `${label}: action width`).toBeGreaterThanOrEqual(44);
  expect(result.action.height, `${label}: action height`).toBeGreaterThanOrEqual(44);
  expect(intersects(result.action, result.world), `${label}: action visible`).toBe(true);
  expect(result.action.left, `${label}: action left`).toBeGreaterThanOrEqual(0);
  expect(result.action.right, `${label}: action right`).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.action.bottom, `${label}: action bottom`).toBeLessThanOrEqual(result.viewport.height + 1);
  expect(result.active.every(item => intersects(item, result.world)), `${label}: active lanterns visible`).toBe(true);
  expect(result.dormant.some(item => intersects(item, result.world)), `${label}: later dormant visible`).toBe(true);
  expect(result.bridge.some(item => intersects(item, result.world)), `${label}: Loombridge span visible`).toBe(true);
  expect(intersects(result.strand, result.world), `${label}: unfinished strand visible`).toBe(true);
  expect(intersects(result.creator, result.title), `${label}: creator/title separation`).toBe(false);
  expect(intersects(result.utilities, result.title), `${label}: utilities/title separation`).toBe(false);

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 7000, polling: 'raf' });
}

async function completeRelay(page, { keyboard = false } = {}) {
  await page.locator('[data-start-relay]').click();
  await expect(page.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    if (keyboard) await page.keyboard.press('Space');
    else await page.locator('[data-tune-relay]').click();
  }
}

for (const locale of LOCALES) {
  test(`${locale.id} focused relay keeps the destination and world structure in every required viewport`, async ({ browser }) => {
    const relay = createLivingWorldLightRelay(makeChapter(3), 3);
    for (const viewport of VIEWPORTS) {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(relayUrl(relay));
      const root = page.locator('[data-living-light-relay][data-route="relay"]');
      await expect(root).toHaveAttribute('data-relay-focus', 'authored');
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await geometry(page, `${locale.id}-${viewport.width}x${viewport.height}`);
      await page.screenshot({
        path: `${OUTPUT}/relay-focus-${locale.id}-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
      await context.close();
    }
  });
}

test('focused relay exposes one trackable bead and structurally activates only the bound target', async ({ browser }) => {
  const relay = createLivingWorldLightRelay(makeChapter(3), 3);
  const context = await createContext(browser, { viewport: VIEWPORTS[0], hasTouch: true });
  const page = await context.newPage();
  await page.goto(relayUrl(relay));
  const before = await page.locator('.signal-lantern').evaluateAll(items => items.map(item => item.dataset.lanternState));

  await page.locator('[data-start-relay]').click();
  const bead = page.locator('[data-light-relay-energy="in-transit"]');
  await expect(bead).toHaveCount(1);
  await expect(bead).toBeVisible();
  const beadBox = await bead.boundingBox();
  const worldBox = await page.locator('[data-light-relay-world]').boundingBox();
  expect(intersects({
    left: beadBox.x,
    right: beadBox.x + beadBox.width,
    top: beadBox.y,
    bottom: beadBox.y + beadBox.height,
  }, {
    left: worldBox.x,
    right: worldBox.x + worldBox.width,
    top: worldBox.y,
    bottom: worldBox.y + worldBox.height,
  })).toBe(true);

  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await page.locator('[data-tune-relay]').click();
  }
  await expect(page.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'impact', { timeout: 7000 });
  await expect(page.locator('[data-lantern-state="accepted"]')).toHaveAttribute('data-lantern-index', '3');
  await expect(page.locator('[data-lantern-state="accepted"] .lantern-inner-ring')).toHaveCount(0);
  const impact = await page.locator('.signal-lantern').evaluateAll(items => items.map(item => item.dataset.lanternState));
  expect(impact.slice(0, 3)).toEqual(before.slice(0, 3));
  expect(impact[3]).toBe('accepted');
  expect(impact.slice(4)).toEqual(before.slice(4));
  await page.screenshot({ path: `${OUTPUT}/relay-focus-en-energy-impact-320x568.png`, fullPage: true });
  await context.close();
});

test('reduced motion, keyboard input, failure, stale recovery, and 200 percent text preserve meaning', async ({ browser }) => {
  const relay = createLivingWorldLightRelay(makeChapter(3), 3);
  const reducedContext = await createContext(browser, {
    locale: 'ar',
    viewport: VIEWPORTS[0],
    reducedMotion: 'reduce',
    hasTouch: false,
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(relayUrl(relay));
  await reducedPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(reducedPage.locator('[data-start-relay]')).toBeVisible();
  await expect(reducedPage.locator('[data-light-relay-target="true"]')).toBeVisible();
  await completeRelay(reducedPage, { keyboard: true });
  await expect(reducedPage.locator('[data-light-relay-energy]')).toHaveCount(0);
  await expect(reducedPage.locator('[data-lantern-state="accepted"]')).toHaveAttribute('data-lantern-index', '3');
  const overflow = await reducedPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await reducedPage.screenshot({ path: `${OUTPUT}/relay-focus-ar-320x568-200-percent-impact.png`, fullPage: true });
  await expect(reducedPage.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'result', { timeout: 7000 });
  await reducedPage.reload();
  await expect(reducedPage.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'stale');
  await expect(reducedPage.locator('[data-light-relay-target="true"]')).toHaveCount(0);
  await expect(reducedPage.locator('.light-relay-structure')).toHaveCount(0);
  await reducedPage.screenshot({ path: `${OUTPUT}/relay-focus-ar-stale-recovery-320x568.png`, fullPage: true });
  await reducedContext.close();

  const failureContext = await createContext(browser, { viewport: VIEWPORTS[1] });
  const failurePage = await failureContext.newPage();
  const freshRelay = createLivingWorldLightRelay(makeChapter(4), 4);
  await failurePage.goto(relayUrl(freshRelay));
  await failurePage.locator('[data-start-relay]').click();
  await expect(failurePage.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'failed', { timeout: 7000 });
  await expect(failurePage.locator('[data-light-relay-target="true"]')).toHaveAttribute('data-lantern-state', 'target');
  await expect(failurePage.locator('[data-relay-retry]')).toBeVisible();
  await failurePage.screenshot({ path: `${OUTPUT}/relay-focus-en-failed-retry-390x844.png`, fullPage: true });
  await failureContext.close();
});
