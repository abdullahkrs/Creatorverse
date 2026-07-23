import { webcrypto } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createLivingWorldEvent, decodeLivingWorldEvent } from '../src/living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  createLivingWorldChapter,
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';
import {
  buildLivingWorldLightRelayUrl,
  createLivingWorldLightRelay,
} from '../src/living-world-light-relay.js';
import { LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME } from '../src/living-world-light-relay-media.js';

mkdirSync('test-results/living-world-light-relay', { recursive: true });
test.setTimeout(240_000);

const LOCALE_KEY = 'creatorverse-locale';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', action: 'Carry light', title: 'Carry the Light' },
  { id: 'ar', dir: 'rtl', action: 'احمل النور', title: 'احمل النور' },
];
let sequence = 90000;

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

function localUrl(absolute) {
  return `/${new URL(absolute).hash}`;
}

function relayUrl(relay) {
  return localUrl(buildLivingWorldLightRelayUrl(relay, { baseUrl: 'https://example.test/' }));
}

function chapterUrl(chapter, progress = chapter.progress) {
  return localUrl(buildLivingWorldChapterUrl(chapter, { progress, baseUrl: 'https://example.test/' }));
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  reducedMotion = 'reduce',
  hasTouch = true,
  chapter = null,
  chapterProgress = null,
  chapterContributed = false,
  chapterOwner = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch });
  const predecessorEventId = chapter ? decodeLivingWorldEvent(chapter.predecessor, { allowExpired: true }).eventId : null;
  await context.addInitScript(({
    localeId,
    chapterValue,
    progressValue,
    contributed,
    owner,
    localeKey,
    storageKey,
    ownerKey,
    predecessorEventIdValue,
  }) => {
    localStorage.setItem(localeKey, localeId);
    window.__CREATORVERSE_RELAY_WINDOW_MS__ = 900;
    window.__CREATORVERSE_RELAY_IMPACT_MS__ = 900;
    window.__CREATORVERSE_CHAPTER_WINDOW_MS__ = 900;
    window.__CREATORVERSE_CHAPTER_IMPACT_MS__ = 180;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__COPIED_LIGHT_RELAY__ = value; } },
    });
    if (chapterValue && Number.isInteger(progressValue)) {
      localStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        chapters: [{
          chapterId: chapterValue.chapterId,
          predecessorEventId: predecessorEventIdValue,
          target: 8,
          progress: progressValue,
          contributed,
        }],
      }));
      if (owner) sessionStorage.setItem(ownerKey, chapterValue.chapterId);
    }
  }, {
    localeId: locale,
    chapterValue: chapter,
    progressValue: chapterProgress,
    contributed: chapterContributed,
    owner: chapterOwner,
    localeKey: LOCALE_KEY,
    storageKey: LIVING_WORLD_CHAPTER_STORAGE_KEY,
    ownerKey: LIVING_WORLD_CHAPTER_OWNER_KEY,
    predecessorEventIdValue: predecessorEventId,
  });
  return context;
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 7000, polling: 'raf' });
}

async function completeRelay(page, { keyboard = false } = {}) {
  const root = page.locator('[data-living-light-relay][data-route="relay"]');
  await page.locator('[data-start-relay]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    if (keyboard) await page.keyboard.press('Space');
    else await page.locator('[data-tune-relay]').click();
  }
  await expect(root).toHaveAttribute('data-phase', 'impact', { timeout: 7000 });
  await expect(root).toHaveAttribute('data-phase', /result|complete/u, { timeout: 7000 });
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('.chapter-primary:visible').last();
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box?.width || 0, `${label}: primary width`).toBeGreaterThanOrEqual(44);
  expect(box?.height || 0, `${label}: primary height`).toBeGreaterThanOrEqual(44);
  const target = page.locator('[data-light-relay-target="true"]');
  await expect(target).toHaveCount(1);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

test('fresh relay opens inside Signal Grove and touch activates exactly its bound lantern once', async ({ browser }) => {
  const chapter = makeChapter(3);
  const relay = createLivingWorldLightRelay(chapter, 3);
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(relayUrl(relay));

  const root = page.locator('[data-living-light-relay][data-route="relay"]');
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.completed-loombridge')).toBeVisible();
  await expect(page.locator('.signal-lantern')).toHaveCount(8);
  await expect(page.locator('[data-light-relay-strand="unfinished"]')).toBeVisible();
  await expect(page.locator('[data-light-relay-target="true"]')).toHaveAttribute('data-lantern-index', '3');

  await completeRelay(page);
  await expect(root).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(4);
  await expect(page.locator('[data-light-relay-target="true"]')).toHaveAttribute('data-lantern-index', '4');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LIVING_WORLD_CHAPTER_STORAGE_KEY);
  expect(stored.chapters).toHaveLength(1);
  expect(stored.chapters[0].progress).toBe(4);

  await page.reload();
  await expect(root).toHaveAttribute('data-phase', 'stale');
  await expect(page.locator('body')).toContainText('The grove has moved forward');
  await context.close();
});

test('keyboard path, onward portrait relay, PNG integrity, and safe copied transport work without progress mutation', async ({ browser }) => {
  const chapter = makeChapter(5);
  const relay = createLivingWorldLightRelay(chapter, 5);
  const context = await createContext(browser, { hasTouch: false });
  const page = await context.newPage();
  await page.goto(relayUrl(relay));
  await completeRelay(page, { keyboard: true });
  await expect(page.locator('[data-living-light-relay]')).toHaveAttribute('data-phase', 'result');

  await page.locator('[data-light-relay-share]').click();
  const dialog = page.locator('[data-light-relay-share-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toHaveAttribute('src', /^blob:/u);
  const before = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_CHAPTER_STORAGE_KEY);
  await dialog.locator('[data-light-relay-copy]').click();
  const copied = await page.evaluate(() => window.__COPIED_LIGHT_RELAY__);
  expect(copied).toContain('#world-relay=');
  expect(copied).not.toMatch(/event_|chapter_|targetIndex=|sender|recipient/u);

  const downloadPromise = page.waitForEvent('download');
  await dialog.locator('[data-light-relay-save]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME);
  const path = await download.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1920);
  const after = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_CHAPTER_STORAGE_KEY);
  expect(after).toBe(before);
  await context.close();
});

test('partial owner share becomes one relay preview while completed chapter retains completed-world sharing', async ({ browser }) => {
  const partial = makeChapter(4);
  const context = await createContext(browser, {
    chapter: partial,
    chapterProgress: 4,
    chapterContributed: false,
    chapterOwner: true,
  });
  const page = await context.newPage();
  await page.goto(chapterUrl(partial, 4));
  await expect(page.locator('[data-chapter-share]')).toBeVisible();
  await page.locator('[data-chapter-share]').click();
  await expect(page.locator('[data-light-relay-share-dialog]')).toBeVisible();
  await page.locator('[data-light-relay-copy]').click();
  expect(await page.evaluate(() => window.__COPIED_LIGHT_RELAY__)).toContain('#world-relay=');
  await context.close();

  const completed = makeChapter(8);
  const completedContext = await createContext(browser, {
    chapter: completed,
    chapterProgress: 8,
    chapterContributed: true,
    chapterOwner: true,
  });
  const completedPage = await completedContext.newPage();
  await completedPage.goto(chapterUrl(completed, 8));
  await completedPage.locator('[data-chapter-share]').click();
  await expect(completedPage.locator('[data-light-relay-share-dialog]')).toHaveCount(0);
  await expect(completedPage.locator('.chapter-share-dialog')).toBeVisible();
  await completedContext.close();
});

test('Arabic and English relay-ready states pass required responsive, RTL/LTR, reduced-motion, zoom, and axe gates', async ({ browser }) => {
  const chapter = makeChapter(6);
  const relay = createLivingWorldLightRelay(chapter, 6);
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(relayUrl(relay));
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('#light-relay-title')).toHaveText(locale.title);
      await expect(page.locator('[data-start-relay]')).toHaveText(locale.action);
      await expectQuality(page, `${locale.id}-${viewport.width}`);
      await page.screenshot({
        path: `test-results/living-world-light-relay/relay-ready-${locale.id}-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
      await context.close();
    }
  }

  const zoomContext = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[0] });
  const zoomPage = await zoomContext.newPage();
  await zoomPage.goto(relayUrl(relay));
  await zoomPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(zoomPage.locator('[data-start-relay]')).toBeVisible();
  await expect(zoomPage.locator('[data-relay-sound]')).toBeVisible();
  await expect(zoomPage.locator('[data-light-relay-target="true"]')).toBeVisible();
  const overflow = await zoomPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await zoomPage.screenshot({
    path: 'test-results/living-world-light-relay/relay-ready-ar-320x568-200-percent.png',
    fullPage: true,
  });
  await zoomContext.close();
});

test('malformed relay fails closed without reflected values or technical transport state', async ({ page }) => {
  await page.goto('/#world-relay=event_bad%3Cscript%3E');
  const root = page.locator('[data-living-light-relay][data-route="recovery"]');
  await expect(root).toBeVisible();
  await expect(root).toContainText('This light path is unavailable');
  await expect(root).not.toContainText('event_bad');
  await expect(root).not.toContainText('world-relay');
});
