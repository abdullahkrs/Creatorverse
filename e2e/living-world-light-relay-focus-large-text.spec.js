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
const VIEWPORT = { width: 320, height: 568 };
const LOCALES = [
  { id: 'en', dir: 'ltr' },
  { id: 'ar', dir: 'rtl' },
];

mkdirSync(OUTPUT, { recursive: true });
test.setTimeout(180_000);
let sequence = 260000;

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

async function createContext(browser, locale) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: 'reduce',
    hasTouch: false,
  });
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

function intersects(first, second) {
  return first.right > second.left
    && first.left < second.right
    && first.bottom > second.top
    && first.top < second.bottom;
}

function contained(rect, viewport = VIEWPORT) {
  return rect.left >= -1
    && rect.top >= -1
    && rect.right <= viewport.width + 1
    && rect.bottom <= viewport.height + 1;
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
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
    return {
      creator: rect('.chapter-creator'),
      utilities: rect('.chapter-utilities'),
      title: rect('.light-relay-title-block h1'),
      progress: rect('.light-relay-progress'),
      action: rect('.chapter-primary'),
      target: rect('[data-light-relay-target="true"] .lantern-core, [data-lantern-state="accepted"] .lantern-core'),
      strand: rect('.light-relay-structure .light-relay-strand'),
      world: rect('[data-light-relay-world]'),
      impact: rect('.light-relay-impact'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function expectSeparated(first, second, label) {
  expect(first, `${label}: first element`).not.toBeNull();
  expect(second, `${label}: second element`).not.toBeNull();
  expect(intersects(first, second), label).toBe(false);
}

async function assertReadyComposition(page, label) {
  const geometry = await readGeometry(page);
  for (const [name, value] of Object.entries({
    creator: geometry.creator,
    utilities: geometry.utilities,
    title: geometry.title,
    progress: geometry.progress,
    action: geometry.action,
    target: geometry.target,
    strand: geometry.strand,
    world: geometry.world,
  })) {
    expect(value, `${label}: ${name} exists`).not.toBeNull();
  }

  expect(geometry.overflow, `${label}: no horizontal overflow`).toBeLessThanOrEqual(1);
  expect(geometry.world.height, `${label}: authored world height`).toBeGreaterThanOrEqual(240);
  expect(geometry.action.width, `${label}: action width`).toBeGreaterThanOrEqual(44);
  expect(geometry.action.height, `${label}: action height`).toBeGreaterThanOrEqual(44);
  expect(contained(geometry.creator), `${label}: creator contained`).toBe(true);
  expect(contained(geometry.utilities), `${label}: utilities contained`).toBe(true);
  expect(contained(geometry.title), `${label}: title contained`).toBe(true);
  expect(contained(geometry.progress), `${label}: progress contained`).toBe(true);
  expect(contained(geometry.action), `${label}: action contained`).toBe(true);
  expect(intersects(geometry.target, geometry.world), `${label}: target visible in world`).toBe(true);
  expect(intersects(geometry.strand, geometry.world), `${label}: strand visible in world`).toBe(true);

  expectSeparated(geometry.creator, geometry.utilities, `${label}: creator/utilities separation`);
  expectSeparated(geometry.creator, geometry.title, `${label}: creator/title separation`);
  expectSeparated(geometry.utilities, geometry.title, `${label}: utilities/title separation`);
  expectSeparated(geometry.title, geometry.progress, `${label}: title/progress separation`);
  expectSeparated(geometry.title, geometry.target, `${label}: title/target separation`);
  expectSeparated(geometry.progress, geometry.target, `${label}: progress/target separation`);
  expectSeparated(geometry.title, geometry.strand, `${label}: title/strand separation`);
  expectSeparated(geometry.progress, geometry.strand, `${label}: progress/strand separation`);
  expectSeparated(geometry.action, geometry.title, `${label}: action/title separation`);
  expectSeparated(geometry.action, geometry.progress, `${label}: action/progress separation`);
  expectSeparated(geometry.action, geometry.target, `${label}: action/target separation`);
  expectSeparated(geometry.action, geometry.strand, `${label}: action/strand separation`);
}

async function assertImpactComposition(page, label) {
  const geometry = await readGeometry(page);
  for (const [name, value] of Object.entries({
    creator: geometry.creator,
    utilities: geometry.utilities,
    title: geometry.title,
    progress: geometry.progress,
    target: geometry.target,
    strand: geometry.strand,
    world: geometry.world,
    impact: geometry.impact,
  })) {
    expect(value, `${label}: ${name} exists`).not.toBeNull();
  }

  expect(geometry.overflow, `${label}: no horizontal overflow`).toBeLessThanOrEqual(1);
  expect(geometry.world.height, `${label}: authored impact world height`).toBeGreaterThanOrEqual(240);
  expect(contained(geometry.impact), `${label}: impact contained`).toBe(true);
  expect(intersects(geometry.target, geometry.world), `${label}: accepted target visible`).toBe(true);
  expect(intersects(geometry.strand, geometry.world), `${label}: connected strand visible`).toBe(true);

  expectSeparated(geometry.creator, geometry.utilities, `${label}: creator/utilities separation`);
  expectSeparated(geometry.title, geometry.target, `${label}: title/target separation`);
  expectSeparated(geometry.progress, geometry.target, `${label}: progress/target separation`);
  expectSeparated(geometry.impact, geometry.target, `${label}: impact/target separation`);
  expectSeparated(geometry.impact, geometry.strand, `${label}: impact/strand separation`);
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 7000, polling: 'raf' });
}

async function completeWithKeyboard(page) {
  await page.locator('[data-start-relay]').click();
  await expect(page.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await page.keyboard.press('Space');
  }
  await expect(page.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'impact', { timeout: 7000 });
}

for (const locale of LOCALES) {
  test(`${locale.id} 320x568 at 200 percent text keeps controls, copy, and destination in separate authored regions`, async ({ browser }) => {
    const context = await createContext(browser, locale.id);
    const page = await context.newPage();
    await page.goto(relayUrl(makeRelay()));
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

    const root = page.locator('[data-living-light-relay][data-route="relay"]');
    await expect(root).toHaveAttribute('data-relay-text-scale', 'large-phone');
    await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
    await assertReadyComposition(page, `${locale.id}-ready`);

    const readyAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(readyAxe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.screenshot({
      path: `${OUTPUT}/relay-focus-${locale.id}-320x568-200-percent-ready.png`,
      fullPage: false,
    });

    await completeWithKeyboard(page);
    await expect(page.locator('[data-lantern-state="accepted"]')).toHaveAttribute('data-lantern-index', '3');
    await assertImpactComposition(page, `${locale.id}-impact`);
    await page.screenshot({
      path: `${OUTPUT}/relay-focus-${locale.id}-320x568-200-percent-accepted.png`,
      fullPage: false,
    });

    await context.close();
  });
}
