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
import { createWorldWakeConnectedPath } from '../src/living-world-light-relay-world-wake.js';

const OUTPUT = 'test-results/living-world-light-relay-world-wake';
const LOCALE_KEY = 'creatorverse-locale';
const TEST_CONTROL = '__CREATORVERSE_WORLD_WAKE_TEST_CONTROL__';
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
test.setTimeout(300_000);
let sequence = 320000;

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}

function makeRelay(progress = 3) {
  const predecessor = createLivingWorldEvent({ duration: '24h', target: 12 }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
  const chapter = createLivingWorldChapter(predecessor, { duration: '24h' }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress,
  });
  return createLivingWorldLightRelay(chapter, progress);
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
    window.__CREATORVERSE_WORLD_WAKE_TEST__ = true;
    window.__CREATORVERSE_RELAY_WINDOW_MS__ = 800;
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

async function waitForWake(page, phase = 'established') {
  await page.waitForFunction(({ controlName, expected }) => {
    const control = window[controlName];
    const state = control?.state?.();
    return state?.active === true && state.phase === expected;
  }, { controlName: TEST_CONTROL, expected: phase });
}

async function setWakeElapsed(page, elapsed) {
  await page.evaluate(({ controlName, value }) => {
    const control = window[controlName];
    if (!control?.setElapsed?.(value)) throw new Error('WORLD_WAKE_NOT_ACTIVE');
  }, { controlName: TEST_CONTROL, value: elapsed });
}

function intersects(a, b) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

async function assertWorldWakeGeometry(page, label, expectedTarget = 3) {
  const geometry = await page.evaluate(() => {
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
    const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
    const world = root.querySelector('[data-light-relay-world]');
    const latest = root.querySelector('.signal-lantern.is-world-wake-latest');
    const target = root.querySelector('.signal-lantern.is-world-wake-next');
    const later = root.querySelector(`[data-lantern-index="${Number(target.dataset.lanternIndex) + 1}"]`);
    const connected = root.querySelector('[data-world-wake-connected]');
    const targetSpan = root.querySelector('[data-world-wake-target-span]');
    const unfinished = root.querySelector('.light-relay-structure.is-unfinished .light-relay-strand');
    return {
      rootPhase: root.dataset.phase,
      wakePhase: root.dataset.worldWakePhase,
      world: rect(world),
      latest: rect(latest),
      target: rect(target),
      later: later ? rect(later) : null,
      creator: rect(root.querySelector('.chapter-creator-strip')),
      title: rect(root.querySelector('.light-relay-title-block')),
      action: rect(root.querySelector('[data-start-relay]')),
      utilities: rect(root.querySelector('.chapter-utilities')),
      connected: rect(connected),
      targetSpan: rect(targetSpan),
      connectedPath: connected.getAttribute('d'),
      targetPath: targetSpan.getAttribute('d'),
      unfinishedPath: unfinished.getAttribute('d'),
      latestIndex: Number(latest.dataset.lanternIndex),
      targetIndex: Number(target.dataset.lanternIndex),
      latestState: latest.dataset.lanternState,
      targetState: target.dataset.lanternState,
      activeCount: root.querySelectorAll('[data-lantern-state="active"]').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.rootPhase, `${label}: authoritative phase`).toBe('ready');
  expect(geometry.latestIndex, `${label}: latest index`).toBe(expectedTarget - 1);
  expect(geometry.targetIndex, `${label}: exact target`).toBe(expectedTarget);
  expect(geometry.latestState, `${label}: latest remains active`).toBe('active');
  expect(geometry.targetState, `${label}: target remains target`).toBe('target');
  expect(geometry.activeCount, `${label}: active projection`).toBe(expectedTarget);
  expect(geometry.connectedPath, `${label}: canonical connected path`).toBe(createWorldWakeConnectedPath(expectedTarget - 1));
  expect(geometry.targetPath, `${label}: canonical unfinished path`).toBe(geometry.unfinishedPath);
  expect(intersects(geometry.latest, geometry.world), `${label}: latest visible`).toBe(true);
  expect(intersects(geometry.target, geometry.world), `${label}: target visible`).toBe(true);
  expect(geometry.later && intersects(geometry.later, geometry.world), `${label}: later dormant visible`).toBe(true);
  expect(intersects(geometry.connected, geometry.world), `${label}: connected echo inside world`).toBe(true);
  expect(intersects(geometry.targetSpan, geometry.world), `${label}: target echo inside world`).toBe(true);
  expect(geometry.action.width, `${label}: action width`).toBeGreaterThanOrEqual(44);
  expect(geometry.action.height, `${label}: action height`).toBeGreaterThanOrEqual(44);
  expect(geometry.action.left, `${label}: action inline start`).toBeGreaterThanOrEqual(0);
  expect(geometry.action.right, `${label}: action inline end`).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  expect(intersects(geometry.creator, geometry.title), `${label}: creator/title separation`).toBe(false);
  expect(intersects(geometry.utilities, geometry.title), `${label}: utilities/title separation`).toBe(false);
  expect(geometry.overflow, `${label}: no overflow`).toBeLessThanOrEqual(1);
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 10_000, polling: 'raf' });
}

async function completeRelay(page, { keyboard = false } = {}) {
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    if (keyboard) await page.keyboard.press('Space');
    else await page.locator('[data-tune-relay]').click();
  }
  await expect(page.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'impact', { timeout: 7000 });
}

for (const locale of LOCALES) {
  test(`${locale.id} World Wake follows authored structure and settles at every required viewport`, async ({ browser }) => {
    const relay = makeRelay(3);
    for (const viewport of VIEWPORTS) {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(relayUrl(relay));
      await waitForWake(page);
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);

      const frames = [
        ['start', 0, 'established'],
        ['mid-connected', 500, 'connected'],
        ['seat', 900, 'seat'],
        ['mid-target', 1400, 'target'],
      ];
      for (const [name, elapsed, phase] of frames) {
        await setWakeElapsed(page, elapsed);
        await expect(page.locator('[data-living-light-relay]')).toHaveAttribute('data-world-wake-phase', phase);
        await assertWorldWakeGeometry(page, `${locale.id}-${viewport.width}x${viewport.height}-${name}`);
        await page.screenshot({
          path: `${OUTPUT}/world-wake-${locale.id}-${viewport.width}x${viewport.height}-${name}.png`,
          fullPage: false,
        });
      }

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);

      await setWakeElapsed(page, 1900);
      await expect(page.locator('[data-world-wake-overlay]')).toHaveCount(0);
      await expect(page.locator('[data-living-light-relay]')).not.toHaveAttribute('data-world-wake');
      await expect(page.locator('[data-light-relay-target="true"]')).toHaveAttribute('data-lantern-state', 'target');
      await page.screenshot({
        path: `${OUTPUT}/world-wake-${locale.id}-${viewport.width}x${viewport.height}-settled.png`,
        fullPage: false,
      });
      await context.close();
    }
  });
}

test('touch and keyboard start interrupt World Wake on the same input and preserve exact-once contribution', async ({ browser }) => {
  const touchRelay = makeRelay(4);
  const touchContext = await createContext(browser, { locale: 'en', viewport: VIEWPORTS[0], hasTouch: true });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(relayUrl(touchRelay));
  await waitForWake(touchPage);
  await setWakeElapsed(touchPage, 500);
  await touchPage.locator('[data-light-relay-world]').dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  await expect(touchPage.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'active');
  await expect(touchPage.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await completeRelay(touchPage);
  await expect(touchPage.locator('[data-lantern-state="accepted"]')).toHaveAttribute('data-lantern-index', '4');
  await touchPage.screenshot({ path: `${OUTPUT}/world-wake-en-320x568-touch-impact.png`, fullPage: false });
  await touchContext.close();

  const keyboardRelay = makeRelay(5);
  const keyboardContext = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[1], hasTouch: false });
  const keyboardPage = await keyboardContext.newPage();
  await keyboardPage.goto(relayUrl(keyboardRelay));
  await waitForWake(keyboardPage);
  await setWakeElapsed(keyboardPage, 1400);
  await keyboardPage.locator('[data-start-relay]').focus();
  await keyboardPage.keyboard.press('Enter');
  await expect(keyboardPage.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'active');
  await expect(keyboardPage.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await completeRelay(keyboardPage, { keyboard: true });
  await expect(keyboardPage.locator('[data-lantern-state="accepted"]')).toHaveAttribute('data-lantern-index', '5');
  await keyboardPage.screenshot({ path: `${OUTPUT}/world-wake-ar-390x844-keyboard-impact.png`, fullPage: false });
  await keyboardContext.close();
});

test('reduced motion, refresh, locale switching, history, large text, invalid and completed states never loop or mislead', async ({ browser }) => {
  const relay = makeRelay(3);
  const context = await createContext(browser, {
    locale: 'ar',
    viewport: VIEWPORTS[0],
    reducedMotion: 'reduce',
    hasTouch: false,
  });
  const page = await context.newPage();
  await page.goto(relayUrl(relay));
  await waitForWake(page, 'reduced');
  const reducedOffsets = await page.evaluate(() => ({
    connected: Number.parseFloat(document.querySelector('[data-world-wake-connected]')?.style.strokeDashoffset || 'NaN'),
    target: Number.parseFloat(document.querySelector('[data-world-wake-target-span]')?.style.strokeDashoffset || 'NaN'),
  }));
  expect(reducedOffsets).toEqual({ connected: 0, target: 0 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await assertWorldWakeGeometry(page, 'ar-320x568-200-percent-reduced');
  await page.screenshot({ path: `${OUTPUT}/world-wake-ar-320x568-200-percent-reduced.png`, fullPage: false });
  await page.evaluate(controlName => window[controlName].settle(), TEST_CONTROL);
  await page.reload();
  await expect(page.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await page.locator('[data-relay-locale="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await page.goto('/');
  await page.goBack();
  await expect(page.locator('[data-living-light-relay][data-route="relay"]')).toBeVisible();
  await expect(page.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await context.close();

  const invalidContext = await createContext(browser, { locale: 'en', viewport: VIEWPORTS[1] });
  const invalidPage = await invalidContext.newPage();
  await invalidPage.goto('/#world-relay=invalid');
  await expect(invalidPage.locator('[data-living-light-relay][data-route="recovery"]')).toBeVisible();
  await expect(invalidPage.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await invalidPage.screenshot({ path: `${OUTPUT}/world-wake-en-invalid-no-wake.png`, fullPage: false });
  await invalidContext.close();

  const completeContext = await createContext(browser, { locale: 'en', viewport: VIEWPORTS[1], hasTouch: false });
  const completePage = await completeContext.newPage();
  const finalRelay = makeRelay(7);
  await completePage.goto(relayUrl(finalRelay));
  await waitForWake(completePage);
  await setWakeElapsed(completePage, 1900);
  await completePage.locator('[data-start-relay]').click();
  await completeRelay(completePage, { keyboard: true });
  await expect(completePage.locator('[data-lantern-state="accepted"]')).toHaveAttribute('data-lantern-index', '7');
  await expect(completePage.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'complete', { timeout: 7000 });
  await expect(completePage.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await completePage.screenshot({ path: `${OUTPUT}/world-wake-en-completed-no-wake.png`, fullPage: false });
  await completePage.reload();
  await expect(completePage.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'stale');
  await expect(completePage.locator('[data-world-wake-overlay]')).toHaveCount(0);
  await completePage.screenshot({ path: `${OUTPUT}/world-wake-en-stale-current-no-wake.png`, fullPage: false });
  await completeContext.close();
});
