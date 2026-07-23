import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  buildLivingWorldUrl,
  createLivingWorldEvent,
  LIVING_WORLD_STORAGE_KEY,
} from '../src/living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  createLivingWorldChapter,
} from '../src/living-world-chapter.js';

mkdirSync('test-results/living-world-chapter', { recursive: true });
test.setTimeout(180_000);

const OWNER_KEY = 'creatorverse-living-world-owner-v1';
const CHAPTER_OWNER_KEY = 'creatorverse-living-world-chapter-owner-v1';
const LOCALE_KEY = 'creatorverse-locale';
const PHONE = { width: 320, height: 568 };
const PORTRAIT = { width: 390, height: 844 };
let sequence = 90000;

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}

function makePredecessor() {
  const now = Date.now();
  return createLivingWorldEvent({ duration: '24h', target: 12 }, {
    now,
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
}

function makeChapter() {
  const predecessor = makePredecessor();
  return createLivingWorldChapter(predecessor, { duration: '24h' }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress: 1,
  });
}

function localUrl(absolute) {
  return `/${new URL(absolute).hash}`;
}

function predecessorUrl(value) {
  return localUrl(buildLivingWorldUrl(value, { baseUrl: 'https://example.test/' }));
}

function chapterUrl(value) {
  return localUrl(buildLivingWorldChapterUrl(value, {
    progress: value.progress,
    baseUrl: 'https://example.test/',
  }));
}

async function createContext(browser, {
  locale = 'en',
  viewport = PORTRAIT,
  predecessor = null,
  owner = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({
    localeId,
    predecessorValue,
    ownerValue,
    localeKey,
    storageKey,
    ownerKey,
    chapterOwnerKey,
  }) => {
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

test('Arabic 320px at 200 percent preserves the complete creator context without clipping', async ({ browser }) => {
  const value = makeChapter();
  const context = await createContext(browser, { locale: 'ar', viewport: PHONE });
  const page = await context.newPage();
  await page.goto(chapterUrl(value));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

  const creator = page.locator('.chapter-creator span');
  await expect(creator).toBeVisible();
  await expect(creator).toHaveText('نورة · الأفق المطوي');

  const metrics = await creator.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const utilitiesRect = document.querySelector('.chapter-utilities')?.getBoundingClientRect();
    const style = getComputedStyle(node);
    const range = document.createRange();
    range.selectNodeContents(node);
    const textRects = Array.from(range.getClientRects());
    return {
      text: node.textContent,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
      viewportWidth: window.innerWidth,
      utilitiesTop: utilitiesRect?.top ?? Number.POSITIVE_INFINITY,
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      textLeft: Math.min(...textRects.map(item => item.left)),
      textRight: Math.max(...textRects.map(item => item.right)),
      textTop: Math.min(...textRects.map(item => item.top)),
      textBottom: Math.max(...textRects.map(item => item.bottom)),
      textRectCount: textRects.length,
    };
  });

  expect(metrics.text).toBe('نورة · الأفق المطوي');
  expect(metrics.whiteSpace).toBe('normal');
  expect(metrics.textOverflow).not.toBe('ellipsis');
  expect(metrics.textRectCount).toBeGreaterThan(0);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.textLeft).toBeGreaterThanOrEqual(metrics.left - 1);
  expect(metrics.textRight).toBeLessThanOrEqual(metrics.right + 1);
  expect(metrics.textTop).toBeGreaterThanOrEqual(metrics.top - 1);
  expect(metrics.textBottom).toBeLessThanOrEqual(metrics.bottom + 1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.utilitiesTop);
  await expect(page.locator('[data-start-signal]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: 'test-results/living-world-chapter/ar-320x568-ready-200-percent-full-creator.png',
    fullPage: true,
  });
  await context.close();
});

for (const locale of [
  { id: 'en', next: 'Next chapter', title: 'Light the Far Shore' },
  { id: 'ar', next: 'الفصل التالي', title: 'أضيئوا الضفة البعيدة' },
]) {
  test(`${locale.id} release evidence includes completed predecessor and compact launch preview`, async ({ browser }) => {
    const predecessor = makePredecessor();
    const context = await createContext(browser, {
      locale: locale.id,
      viewport: PORTRAIT,
      predecessor,
      owner: true,
    });
    const page = await context.newPage();
    await page.goto(predecessorUrl(predecessor));

    const next = page.locator('[data-next-chapter]');
    await expect(next).toBeVisible();
    await expect(next).toHaveText(locale.next);
    await page.screenshot({
      path: `test-results/living-world-chapter/${locale.id}-390x844-completed-predecessor-next-chapter.png`,
      fullPage: true,
    });

    await next.click();
    const sheet = page.locator('[data-chapter-launch-sheet]');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('#chapter-launch-title')).toHaveText(locale.title);
    await expect(sheet.locator('.chapter-launch-preview .far-shore-world')).toBeVisible();
    await expect(sheet.locator('[data-launch-chapter]')).toBeVisible();
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox?.width || 0).toBeLessThanOrEqual(PORTRAIT.width);
    expect(sheetBox?.height || 0).toBeLessThanOrEqual(PORTRAIT.height);
    expect(sheetBox?.x || 0).toBeGreaterThanOrEqual(0);
    expect((sheetBox?.x || 0) + (sheetBox?.width || 0)).toBeLessThanOrEqual(PORTRAIT.width);
    await page.screenshot({
      path: `test-results/living-world-chapter/${locale.id}-390x844-compact-chapter-launch-preview.png`,
      fullPage: true,
    });

    await context.close();
  });
}
