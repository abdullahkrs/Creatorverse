import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
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
  const image = page.locator('[data-returning-thread-share-dialog] img');
  await expect(image).toBeVisible();
  const integrity = await image.evaluate(async node => {
    if (!node.complete) await new Promise(resolve => node.addEventListener('load', resolve, { once: true }));
    const response = await fetch(node.src);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    return {
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
      type: response.headers.get('content-type'),
      size: bytes.length,
      signature: [...bytes.slice(0, 8)],
      hasThreadKey: text.includes('creatorverse-returning-thread-v1'),
      hasEventId: text.includes('event_'),
      hasChapterId: text.includes('chapter_'),
      hasThreadLabel: text.includes('Your thread'),
    };
  });
  expect(integrity.naturalWidth).toBe(1080);
  expect(integrity.naturalHeight).toBe(1920);
  expect(integrity.type).toContain('image/png');
  expect(integrity.size).toBeGreaterThan(1024);
  expect(integrity.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(integrity.hasThreadKey).toBe(false);
  expect(integrity.hasEventId).toBe(false);
  expect(integrity.hasChapterId).toBe(false);
  expect(integrity.hasThreadLabel).toBe(false);
  await page.screenshot({
    path: 'test-results/living-world-returning-thread/en-thread-png-integrity-preview.png',
    fullPage: true,
  });
  await context.close();
});
