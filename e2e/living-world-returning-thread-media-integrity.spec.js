import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createLivingWorldEvent } from '../src/living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  createLivingWorldChapter,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';
import {
  RETURNING_THREAD_STORAGE_KEY,
  serializeReturningThread,
} from '../src/living-world-returning-thread.js';

mkdirSync('test-results/living-world-returning-thread', { recursive: true });

let sequence = 98000;
function opaque(prefix) { return `${prefix}_${String(sequence++).padStart(24, '0')}`; }

function values() {
  const now = Date.now();
  const predecessor = createLivingWorldEvent({ duration: '24h', target: 12 }, {
    now,
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
  const chapter = createLivingWorldChapter(predecessor, { duration: '24h' }, {
    now,
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress: 7,
  });
  const thread = {
    v: 1,
    kind: 'notched-spine',
    predecessorEventId: predecessor.eventId,
    motif: predecessor.motif,
    landmark: predecessor.landmark,
    contributionBinding: `accepted:${predecessor.eventId}`,
  };
  return { predecessor, chapter, thread };
}

test('returning-thread share exports one exact metadata-free 1080x1920 PNG', async ({ browser }) => {
  const { predecessor, chapter, thread } = values();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  await context.addInitScript(({ predecessorValue, chapterValue, threadValue, chapterStorageKey, threadStorageKey }) => {
    localStorage.setItem('creatorverse-locale', 'en');
    localStorage.setItem(threadStorageKey, threadValue);
    localStorage.setItem(chapterStorageKey, JSON.stringify({
      version: 1,
      chapters: [{
        chapterId: chapterValue.chapterId,
        predecessorEventId: predecessorValue.eventId,
        target: 8,
        progress: 8,
        contributed: true,
      }],
    }));
    sessionStorage.setItem('creatorverse-living-world-chapter-owner-v1', chapterValue.chapterId);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  }, {
    predecessorValue: predecessor,
    chapterValue: chapter,
    threadValue: serializeReturningThread(thread),
    chapterStorageKey: LIVING_WORLD_CHAPTER_STORAGE_KEY,
    threadStorageKey: RETURNING_THREAD_STORAGE_KEY,
  });

  const page = await context.newPage();
  const absolute = buildLivingWorldChapterUrl(chapter, { progress: 7, baseUrl: 'https://example.test/' });
  await page.goto(`/${new URL(absolute).hash}`);
  await page.locator('[data-chapter-share]').click();
  const dialog = page.locator('[data-returning-thread-share-dialog]');
  const image = dialog.locator('img');
  await expect(image).toBeVisible();
  const dimensions = await image.evaluate(async node => {
    if (!node.complete) await new Promise(resolve => node.addEventListener('load', resolve, { once: true }));
    return { width: node.naturalWidth, height: node.naturalHeight };
  });
  expect(dimensions).toEqual({ width: 1080, height: 1920 });

  const downloadPromise = page.waitForEvent('download');
  await dialog.locator('[data-returning-thread-save]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('creatorverse-light-far-shore.png');
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const bytes = new Uint8Array(await readFile(downloadedPath));
  const text = new TextDecoder().decode(bytes);
  expect(bytes.length).toBeGreaterThan(1024);
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(text).not.toContain('creatorverse-returning-thread-v1');
  expect(text).not.toContain('event_');
  expect(text).not.toContain('chapter_');
  expect(text).not.toContain('Your thread');

  await page.screenshot({
    path: 'test-results/living-world-returning-thread/en-thread-png-integrity-preview.png',
    fullPage: true,
  });
  await context.close();
});