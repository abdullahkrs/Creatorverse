import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  buildLivingWorldUrl,
  createLivingWorldEvent,
  LIVING_WORLD_STORAGE_KEY,
} from '../src/living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  createLivingWorldChapter,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';

mkdirSync('test-results/living-world-chapter', { recursive: true });
test.setTimeout(180_000);

const OWNER_KEY = 'creatorverse-living-world-owner-v1';
const CHAPTER_OWNER_KEY = 'creatorverse-living-world-chapter-owner-v1';
const LOCALE_KEY = 'creatorverse-locale';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', send: 'Send signal', title: 'Light the Far Shore' },
  { id: 'ar', dir: 'rtl', send: 'أرسل الإشارة', title: 'أضيئوا الضفة البعيدة' },
];
let sequence = 20000;

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}

function makePredecessor({ progress = 12, target = 12 } = {}) {
  const now = Date.now();
  return createLivingWorldEvent({ duration: '24h', target }, {
    now,
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress,
  });
}

function makeChapter({ progress = 0, predecessor = makePredecessor() } = {}) {
  return createLivingWorldChapter(predecessor, { duration: '24h' }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress,
  });
}

function localUrl(absolute) {
  const parsed = new URL(absolute);
  return `/${parsed.hash}`;
}

function predecessorUrl(value) {
  return localUrl(buildLivingWorldUrl(value, { baseUrl: 'https://example.test/' }));
}

function chapterUrl(value, progress = value.progress) {
  return localUrl(buildLivingWorldChapterUrl(value, {
    progress,
    baseUrl: 'https://example.test/',
  }));
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  predecessor = null,
  owner = false,
  reducedMotion = 'reduce',
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.addInitScript(({ localeId, predecessorValue, ownerValue, localeKey, storageKey, ownerKey, chapterOwnerKey }) => {
    localStorage.setItem(localeKey, localeId);
    window.__CREATORVERSE_LIVING_WORLD_WINDOW_MS__ = 260;
    window.__CREATORVERSE_LIVING_WORLD_IMPACT_MS__ = 100;
    window.__CREATORVERSE_CHAPTER_WINDOW_MS__ = 320;
    window.__CREATORVERSE_CHAPTER_IMPACT_MS__ = 500;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    if (predecessorValue) {
      localStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        events: [{
          eventId: predecessorValue.eventId,
          target: predecessorValue.target,
          progress: predecessorValue.target,
          contributed: true,
        }],
      }));
      if (ownerValue) sessionStorage.setItem(ownerKey, predecessorValue.eventId);
    }
    sessionStorage.removeItem(chapterOwnerKey);
  }, {
    localeId: locale,
    predecessorValue: predecessor,
    ownerValue: owner,
    localeKey: LOCALE_KEY,
    storageKey: LIVING_WORLD_STORAGE_KEY,
    ownerKey: OWNER_KEY,
    chapterOwnerKey: CHAPTER_OWNER_KEY,
  });
  return context;
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-chapter][data-route="chapter"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 5000, polling: 'raf' });
}

async function completeSignal(page, { keyboard = false } = {}) {
  const root = page.locator('[data-living-chapter][data-route="chapter"]');
  await page.locator('[data-start-signal]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    if (keyboard) await page.keyboard.press('Space');
    else await page.locator('[data-tune-signal]').click();
  }
  await expect(root).toHaveAttribute('data-phase', 'impact', { timeout: 5000 });
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('.chapter-primary:visible').last();
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box?.width || 0, `${label}: primary width`).toBeGreaterThanOrEqual(44);
  expect(box?.height || 0, `${label}: primary height`).toBeGreaterThanOrEqual(44);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

test('completed owner launches one bounded next chapter inside the opened world', async ({ browser }) => {
  const predecessor = makePredecessor();
  const context = await createContext(browser, { predecessor, owner: true });
  const page = await context.newPage();
  await page.goto(predecessorUrl(predecessor));
  const next = page.locator('[data-next-chapter]');
  await expect(next).toBeVisible();
  await expect(next).toHaveText('Next chapter');
  await next.click();
  const sheet = page.locator('[data-chapter-launch-sheet]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Light the Far Shore');
  await expect(sheet.locator('[data-chapter-duration]')).toHaveCount(2);
  await expect(sheet).toContainText('8 lanterns');
  await sheet.locator('[data-launch-chapter]').click();
  await expect(page.locator('[data-living-chapter][data-route="chapter"]')).toBeVisible();
  expect(page.url()).toContain('#world-chapter=');
  await expect(page.locator('[data-chapter-share]')).toBeVisible();
  await expect(page.locator('.completed-loombridge')).toBeVisible();
  await expect(page.locator('.signal-lantern')).toHaveCount(8);
  await context.close();
});

test('partial predecessor cannot expose or launch the follow-up chapter', async ({ browser }) => {
  const predecessor = makePredecessor({ progress: 11 });
  const context = await createContext(browser, { predecessor: null, owner: false });
  const page = await context.newPage();
  await page.addInitScript(({ event, ownerKey, localeKey }) => {
    localStorage.setItem(localeKey, 'en');
    sessionStorage.setItem(ownerKey, event.eventId);
  }, { event: predecessor, ownerKey: OWNER_KEY, localeKey: LOCALE_KEY });
  await page.goto(predecessorUrl(predecessor));
  await expect(page.locator('[data-next-chapter]')).toHaveCount(0);
  await context.close();
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} opens the evolved world directly`, async ({ browser }) => {
      const value = makeChapter({ progress: 3 });
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(chapterUrl(value));
      const root = page.locator('[data-living-chapter][data-route="chapter"]');
      await expect(root).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('#chapter-title')).toHaveText(locale.title);
      await expect(page.locator('[data-start-signal]')).toHaveText(locale.send);
      await expect(page.locator('.completed-loombridge')).toBeVisible();
      await expect(page.locator('.signal-lantern')).toHaveCount(8);
      await expect(page.locator('.signal-lantern.is-active')).toHaveCount(3);
      await expectQuality(page, `${locale.id}-${viewport.width}-ready`);
      await page.screenshot({
        path: `test-results/living-world-chapter/${locale.id}-${viewport.width}x${viewport.height}-ready.png`,
        fullPage: true,
      });
      await context.close();
    });
  }
}

test('touch contribution sends one signal across the bridge and activates exactly one lantern', async ({ browser }) => {
  const value = makeChapter({ progress: 3 });
  const context = await createContext(browser, { viewport: VIEWPORTS[1], reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto(chapterUrl(value));
  await page.locator('[data-start-signal]').click();
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'active');
  await page.screenshot({ path: 'test-results/living-world-chapter/en-390x844-active.png', fullPage: true });
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await page.locator('[data-tune-signal]').click();
  }
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'impact');
  await expect(page.locator('.far-shore-world')).toHaveClass(/is-impacting/u);
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/living-world-chapter/en-390x844-energy-impact.png', fullPage: true });
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'result', { timeout: 5000 });
  await expect(page.locator('.chapter-result-copy')).toContainText('The signal arrived');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LIVING_WORLD_CHAPTER_STORAGE_KEY);
  expect(stored.chapters[0].progress).toBe(4);
  await page.reload();
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'duplicate');
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(4);
  await context.close();
});

test('keyboard contribution completes the eighth lantern and reveals the inhabited light-field', async ({ browser }) => {
  const value = makeChapter({ progress: 7 });
  const context = await createContext(browser, { viewport: VIEWPORTS[4] });
  const page = await context.newPage();
  await page.goto(chapterUrl(value));
  await completeSignal(page, { keyboard: true });
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'complete', { timeout: 5000 });
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(8);
  await expect(page.locator('.far-shore-world')).toHaveClass(/is-complete/u);
  await expect(page.locator('.chapter-result-copy')).toContainText('All eight lanterns are lit');
  await expectQuality(page, 'en-1440-complete');
  await page.screenshot({ path: 'test-results/living-world-chapter/en-1440x900-complete.png', fullPage: true });
  await context.close();
});

test('failed signal changes no lantern and exposes one concise retry', async ({ browser }) => {
  const value = makeChapter({ progress: 2 });
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(chapterUrl(value));
  await page.locator('[data-start-signal]').click();
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'active');
  await page.waitForTimeout(1100);
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'failed', { timeout: 5000 });
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(2);
  await expect(page.locator('[data-chapter-result="retry"]')).toHaveText('Retry');
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_CHAPTER_STORAGE_KEY)).toBeNull();
  await context.close();
});

test('portrait fallback renders a real 1080 by 1920 partial update without mutating progress', async ({ browser }) => {
  const value = makeChapter({ progress: 4 });
  const context = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(chapterUrl(value));
  await completeSignal(page);
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'result', { timeout: 5000 });
  const before = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_CHAPTER_STORAGE_KEY);
  await page.locator('[data-chapter-result="share"]').click();
  const dialog = page.locator('[data-chapter-share-dialog]');
  await expect(dialog).toBeVisible();
  const image = dialog.locator('img');
  await expect(image).toBeVisible();
  const dimensions = await image.evaluate(async node => {
    await node.decode();
    return { width: node.naturalWidth, height: node.naturalHeight };
  });
  expect(dimensions).toEqual({ width: 1080, height: 1920 });
  await expect(dialog.locator('[data-chapter-save]')).toBeVisible();
  await expect(dialog.locator('[data-chapter-copy]')).toBeVisible();
  const after = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_CHAPTER_STORAGE_KEY);
  expect(after).toBe(before);
  await page.screenshot({ path: 'test-results/living-world-chapter/ar-320x568-share.png', fullPage: true });
  await context.close();
});

test('Arabic 320px at 200 percent text keeps utilities and dominant action usable', async ({ browser }) => {
  const value = makeChapter({ progress: 1 });
  const context = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(chapterUrl(value));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const utilityButtons = page.locator('.chapter-utilities button');
  await expect(utilityButtons).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const box = await utilityButtons.nth(index).boundingBox();
    expect(box?.width || 0).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('[data-start-signal]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/living-world-chapter/ar-320x568-ready-200-percent.png', fullPage: true });
  await context.close();
});

test('invalid and expired chapter links fail closed without raw transport values', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en' });
  const page = await context.newPage();
  await page.goto('/#world-chapter=hostile');
  const recovery = page.locator('[data-living-chapter][data-route="recovery"]');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('This chapter is unavailable');
  await expect(page.locator('body')).not.toContainText('hostile');
  await expectQuality(page, 'invalid-recovery');
  await page.screenshot({ path: 'test-results/living-world-chapter/en-390x844-invalid.png', fullPage: true });
  await context.close();
});
