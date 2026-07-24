import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createLivingWorldEvent } from '../src/living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  createLivingWorldChapter,
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';
import {
  buildLivingWorldSkywellUrl,
  createLivingWorldSkywell,
  decodeLivingWorldSkywell,
  LIVING_WORLD_SKYWELL_ROUTE_KEY,
} from '../src/living-world-skywell.js';

const OUTPUT = 'test-results/living-world-skywell';
const LOCALE_KEY = 'creatorverse-locale';
const TEST_CONTROL = '__CREATORVERSE_SKYWELL_TEST_CONTROL__';
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
let sequence = 880000;

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}
function makeCompletedChapter() {
  const predecessor = createLivingWorldEvent({ duration: '6h', target: 12 }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
  const chapter = createLivingWorldChapter(predecessor, { duration: '6h' }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress: 8,
  });
  return { predecessor, chapter };
}
function makeSkywell(progress = 0) {
  const { chapter } = makeCompletedChapter();
  return createLivingWorldSkywell(chapter, {
    now: Date.now(),
    cryptoLike: webcrypto,
    eventId: opaque('sky'),
    progress,
  });
}
function skywellUrl(event) {
  return `/${new URL(buildLivingWorldSkywellUrl(event, { baseUrl: 'https://example.test/' })).hash}`;
}
function chapterUrl(chapter) {
  return `/${new URL(buildLivingWorldChapterUrl(chapter, { progress: 8, baseUrl: 'https://example.test/' })).hash}`;
}
async function contextFor(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  reducedMotion = 'no-preference',
  forcedColors = 'none',
  chapterSeed = null,
  malformedSkywellStore = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, forcedColors, hasTouch: true });
  await context.addInitScript(({ localeId, localeKey, seed, malformed }) => {
    localStorage.setItem(localeKey, localeId);
    window.__CREATORVERSE_SKYWELL_TEST__ = true;
    window.__CREATORVERSE_SKYWELL_IMPACT_MS__ = 80;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
    if (seed) {
      localStorage.setItem(seed.storageKey, JSON.stringify(seed.storageValue));
      sessionStorage.setItem(seed.ownerKey, seed.ownerValue);
    }
    if (malformed) localStorage.setItem('creatorverse-living-world-skywell-v1', '{bad');
  }, { localeId: locale, localeKey: LOCALE_KEY, seed: chapterSeed, malformed: malformedSkywellStore });
  return context;
}
async function completeWithControl(page) {
  await page.evaluate(controlName => {
    const control = window[controlName];
    if (!control?.start?.()) throw new Error('SKYWELL_TEST_CONTROL_NOT_READY');
    for (let index = 0; index < 3; index += 1) {
      if (!control.setWindow(index, 0.5)) throw new Error('SKYWELL_TEST_WINDOW_FAILED');
      control.tune();
    }
    control.finish();
  }, TEST_CONTROL);
}
function intersects(a, b) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}
async function assertGeometry(page, label, { expectAction = true } = {}) {
  const geometry = await page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
      creator: rect('.chapter-creator'),
      utilities: rect('.chapter-utilities'),
      title: rect('.skywell-title-block'),
      world: rect('[data-skywell-world]'),
      landmark: rect('.skywell-landmark'),
      target: rect('[data-skywell-target="true"]'),
      action: rect('[data-start-skywell], [data-tune-skywell], [data-skywell-share], [data-skywell-retry]'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.creator, `${label}: creator`).not.toBeNull();
  expect(geometry.utilities, `${label}: utilities`).not.toBeNull();
  expect(geometry.world, `${label}: world`).not.toBeNull();
  expect(geometry.landmark, `${label}: landmark`).not.toBeNull();
  expect(intersects(geometry.creator, geometry.viewport), `${label}: creator visible`).toBe(true);
  expect(intersects(geometry.utilities, geometry.viewport), `${label}: utilities visible`).toBe(true);
  expect(intersects(geometry.landmark, geometry.world), `${label}: Skywell inside world`).toBe(true);
  expect(intersects(geometry.creator, geometry.utilities), `${label}: creator utilities separate`).toBe(false);
  if (geometry.title) expect(intersects(geometry.creator, geometry.title), `${label}: creator title separate`).toBe(false);
  if (geometry.target) expect(intersects(geometry.target, geometry.world), `${label}: target visible`).toBe(true);
  if (expectAction) {
    expect(geometry.action, `${label}: action`).not.toBeNull();
    expect(geometry.action.width, `${label}: action width`).toBeGreaterThanOrEqual(44);
    expect(geometry.action.height, `${label}: action height`).toBeGreaterThanOrEqual(44);
    expect(intersects(geometry.action, geometry.viewport), `${label}: action visible`).toBe(true);
  }
  expect(geometry.overflow, `${label}: no horizontal overflow`).toBeLessThanOrEqual(1);
}
async function assertAxe(page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
}

for (const locale of LOCALES) {
  test(`${locale.id} direct Skywell entry stays world-first at every required viewport`, async ({ browser }) => {
    const event = makeSkywell(2);
    for (const viewport of VIEWPORTS) {
      const context = await contextFor(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(skywellUrl(event));
      await expect(page).toHaveURL(/#skywell$/u);
      await expect(page.locator('[data-living-skywell][data-route="skywell"]')).toHaveAttribute('data-phase', 'ready');
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('[data-skywell-rib].is-open')).toHaveCount(2);
      await expect(page.locator('[data-skywell-target="true"]')).toHaveAttribute('data-skywell-rib', '2');
      await assertGeometry(page, `${locale.id}-${viewport.width}x${viewport.height}`);
      await page.screenshot({ path: `${OUTPUT}/skywell-${locale.id}-${viewport.width}x${viewport.height}-ready.png`, fullPage: false });
      if (viewport.width === 390) await assertAxe(page);
      await context.close();
    }
  });
}

test('valid completed-Grove creator launches one compact in-world continuation and follower cannot', async ({ browser }) => {
  const { predecessor, chapter } = makeCompletedChapter();
  const seed = {
    storageKey: LIVING_WORLD_CHAPTER_STORAGE_KEY,
    storageValue: {
      version: 1,
      chapters: [{
        chapterId: chapter.chapterId,
        predecessorEventId: predecessor.eventId,
        target: 8,
        progress: 8,
        contributed: true,
      }],
    },
    ownerKey: LIVING_WORLD_CHAPTER_OWNER_KEY,
    ownerValue: chapter.chapterId,
  };
  const creatorContext = await contextFor(browser, { locale: 'en', viewport: VIEWPORTS[1], chapterSeed: seed });
  const creatorPage = await creatorContext.newPage();
  await creatorPage.goto(chapterUrl(chapter));
  await expect(creatorPage.locator('[data-launch-skywell]')).toBeVisible();
  await expect(creatorPage.locator('[data-chapter-share]:visible, [data-chapter-view]:visible')).toHaveCount(0);
  await expect(creatorPage.locator('[data-skywell-launch-preview]')).toHaveCount(1);
  await creatorPage.screenshot({ path: `${OUTPUT}/skywell-en-390x844-creator-launch.png`, fullPage: false });
  await creatorPage.locator('[data-launch-skywell]').click();
  await expect(creatorPage).toHaveURL(/#skywell$/u);
  await expect(creatorPage.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'owner');
  await expect(creatorPage.locator('[data-skywell-share]')).toBeVisible();
  const token = await creatorPage.evaluate(key => sessionStorage.getItem(key), LIVING_WORLD_SKYWELL_ROUTE_KEY);
  expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  await creatorContext.close();

  const followerContext = await contextFor(browser, { locale: 'en', viewport: VIEWPORTS[1] });
  const followerPage = await followerContext.newPage();
  await followerPage.goto(chapterUrl(chapter));
  await expect(followerPage.locator('[data-launch-skywell]')).toHaveCount(0);
  await followerContext.close();
});

test('touch, scene pointer, Enter and Space operate the same bounded exact-next-rib contribution', async ({ browser }) => {
  const event = makeSkywell(3);
  const context = await contextFor(browser, { locale: 'en', viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(skywellUrl(event));
  await page.locator('[data-skywell-world]').dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  await expect(page.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'active');
  await page.evaluate(controlName => {
    const control = window[controlName];
    for (let index = 0; index < 3; index += 1) { control.setWindow(index, 0.5); control.tune(); }
    control.finish();
  }, TEST_CONTROL);
  await expect(page.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'impact');
  await expect(page.locator('[data-skywell-rib="3"]')).toHaveClass(/is-impact/u);
  await page.screenshot({ path: `${OUTPUT}/skywell-en-320x568-impact.png`, fullPage: false });
  await expect(page.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'result', { timeout: 4000 });
  await expect(page.locator('[data-skywell-rib].is-open')).toHaveCount(4);
  await assertGeometry(page, 'touch-impact-result');
  await context.close();

  const keyboardEvent = makeSkywell(1);
  const keyboardContext = await contextFor(browser, { locale: 'ar', viewport: VIEWPORTS[1] });
  const keyboardPage = await keyboardContext.newPage();
  await keyboardPage.goto(skywellUrl(keyboardEvent));
  await keyboardPage.locator('[data-start-skywell]').focus();
  await keyboardPage.keyboard.press('Enter');
  await expect(keyboardPage.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await keyboardPage.evaluate(({ controlName, indexValue }) => window[controlName].setWindow(indexValue, 0.5), { controlName: TEST_CONTROL, indexValue: index });
    await keyboardPage.keyboard.press('Space');
  }
  await keyboardPage.evaluate(controlName => window[controlName].finish(), TEST_CONTROL);
  await expect(keyboardPage.locator('[data-skywell-rib="1"]')).toHaveClass(/is-impact/u);
  await keyboardContext.close();
});

test('sixth rib completion, reduced motion, forced colors and 200% text preserve all state meaning', async ({ browser }) => {
  const event = makeSkywell(5);
  const context = await contextFor(browser, {
    locale: 'ar', viewport: VIEWPORTS[0], reducedMotion: 'reduce', forcedColors: 'active',
  });
  const page = await context.newPage();
  await page.goto(skywellUrl(event));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await assertGeometry(page, 'ar-320x568-200-percent-reduced');
  await page.screenshot({ path: `${OUTPUT}/skywell-ar-320x568-200-percent-ready.png`, fullPage: false });
  await completeWithControl(page);
  await expect(page.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'complete', { timeout: 4000 });
  await expect(page.locator('[data-skywell-rib].is-open')).toHaveCount(6);
  await expect(page.locator('.skywell-world')).toHaveClass(/is-complete/u);
  await expect(page.locator('[data-skywell-share]')).toBeVisible();
  await assertGeometry(page, 'ar-320x568-complete');
  await page.screenshot({ path: `${OUTPUT}/skywell-ar-320x568-complete.png`, fullPage: false });
  await assertAxe(page);
  await context.close();
});

test('portrait fallback sharing renders a real 1080x1920 PNG and does not mutate progress', async ({ browser }) => {
  const event = makeSkywell(2);
  const context = await contextFor(browser, { locale: 'en', viewport: VIEWPORTS[1] });
  const page = await context.newPage();
  await page.goto(skywellUrl(event));
  await completeWithControl(page);
  await expect(page.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'result', { timeout: 4000 });
  const progressBefore = await page.locator('[role="progressbar"]').getAttribute('aria-valuenow');
  await page.locator('[data-skywell-share]').click();
  await expect(page.locator('[data-skywell-share-dialog]')).toBeVisible();
  const dimensions = await page.locator('[data-skywell-share-dialog] img').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }));
  expect(dimensions).toEqual({ width: 1080, height: 1920 });
  await expect(page.locator('[data-skywell-save]')).toHaveAttribute('download', 'creatorverse-open-skywell.png');
  await page.screenshot({ path: `${OUTPUT}/skywell-en-390x844-share.png`, fullPage: false });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-skywell-share-dialog]')).toHaveCount(0);
  await expect(page.locator('[data-skywell-share]')).toBeFocused();
  expect(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow')).toBe(progressBefore);
  await context.close();
});

test('malformed, storage-failure, refresh, locale switch and Back/Forward fail closed without multiplying progress', async ({ browser }) => {
  const invalidContext = await contextFor(browser, { locale: 'en', viewport: VIEWPORTS[0] });
  const invalidPage = await invalidContext.newPage();
  await invalidPage.goto('/#skywell=bad');
  await expect(invalidPage.locator('[data-living-skywell][data-route="recovery"]')).toBeVisible();
  await invalidPage.screenshot({ path: `${OUTPUT}/skywell-en-320x568-invalid.png`, fullPage: false });
  await invalidContext.close();

  const event = makeSkywell(1);
  const storageContext = await contextFor(browser, { locale: 'ar', viewport: VIEWPORTS[1], malformedSkywellStore: true });
  const storagePage = await storageContext.newPage();
  await storagePage.goto(skywellUrl(event));
  await expect(storagePage.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'storage-error');
  await expect(storagePage.locator('[data-skywell-retry]')).toBeVisible();
  await assertAxe(storagePage);
  await storageContext.close();

  const stableContext = await contextFor(browser, { locale: 'en', viewport: VIEWPORTS[1] });
  const stablePage = await stableContext.newPage();
  await stablePage.goto(skywellUrl(event));
  await expect(stablePage).toHaveURL(/#skywell$/u);
  const cached = await stablePage.evaluate(key => sessionStorage.getItem(key), LIVING_WORLD_SKYWELL_ROUTE_KEY);
  expect(decodeLivingWorldSkywell(cached).progress).toBe(1);
  await stablePage.reload();
  await expect(stablePage.locator('[data-living-skywell]')).toHaveAttribute('data-phase', 'ready');
  await stablePage.locator('[data-skywell-locale="ar"]').click();
  await expect(stablePage.locator('html')).toHaveAttribute('dir', 'rtl');
  await stablePage.goBack();
  await stablePage.goForward();
  await expect(stablePage.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '1');
  await stableContext.close();
});
