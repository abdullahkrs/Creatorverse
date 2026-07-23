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
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';
import {
  RETURNING_THREAD_STORAGE_KEY,
  serializeReturningThread,
} from '../src/living-world-returning-thread.js';

mkdirSync('test-results/living-world-returning-thread', { recursive: true });
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
  { id: 'en', dir: 'ltr', label: 'Your thread', extended: 'Your thread reached the lantern' },
  { id: 'ar', dir: 'rtl', label: 'خيطك', extended: 'وصل خيطك إلى المنارة' },
];
let sequence = 70000;

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}

function makePredecessor({ progress = 12 } = {}) {
  return createLivingWorldEvent({ duration: '24h', target: 12 }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress,
  });
}

function makeChapter({ predecessor = makePredecessor(), progress = 3 } = {}) {
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

function eventUrl(value) {
  return localUrl(buildLivingWorldUrl(value, { baseUrl: 'https://example.test/' }));
}

function chapterUrl(value, progress = value.progress) {
  return localUrl(buildLivingWorldChapterUrl(value, { progress, baseUrl: 'https://example.test/' }));
}

function threadFor(predecessor, kind = 'offset-weft') {
  return {
    v: 1,
    kind,
    predecessorEventId: predecessor.eventId,
    motif: predecessor.motif,
    landmark: predecessor.landmark,
    contributionBinding: `accepted:${predecessor.eventId}`,
  };
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  reducedMotion = 'reduce',
  predecessor = null,
  chapter = null,
  thread = null,
  chapterProgress = null,
  chapterContributed = false,
  chapterOwner = false,
  malformedThread = false,
  failThreadStorage = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.addInitScript(({
    localeId,
    predecessorValue,
    chapterValue,
    threadSerialized,
    localChapterProgress,
    contributed,
    owner,
    malformed,
    blockThreadStorage,
    localeKey,
    eventStorageKey,
    chapterStorageKey,
    chapterOwnerKey,
    threadStorageKey,
  }) => {
    localStorage.setItem(localeKey, localeId);
    window.__CREATORVERSE_LIVING_WORLD_WINDOW_MS__ = 1000;
    window.__CREATORVERSE_LIVING_WORLD_IMPACT_MS__ = 100;
    window.__CREATORVERSE_CHAPTER_WINDOW_MS__ = 1000;
    window.__CREATORVERSE_CHAPTER_IMPACT_MS__ = 500;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => sessionStorage.setItem('__returning_thread_clipboard', value) },
    });
    if (predecessorValue) {
      localStorage.setItem(eventStorageKey, JSON.stringify({
        version: 1,
        events: [{
          eventId: predecessorValue.eventId,
          target: predecessorValue.target,
          progress: predecessorValue.target,
          contributed: true,
        }],
      }));
    }
    if (threadSerialized) localStorage.setItem(threadStorageKey, threadSerialized);
    if (malformed) localStorage.setItem(threadStorageKey, `${threadSerialized}&kind=twin-latch`);
    if (chapterValue && localChapterProgress !== null) {
      localStorage.setItem(chapterStorageKey, JSON.stringify({
        version: 1,
        chapters: [{
          chapterId: chapterValue.chapterId,
          predecessorEventId: predecessorValue.eventId,
          target: 8,
          progress: localChapterProgress,
          contributed,
        }],
      }));
    }
    if (chapterValue && owner) sessionStorage.setItem(chapterOwnerKey, chapterValue.chapterId);
    if (blockThreadStorage) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === threadStorageKey) throw new Error('CONTROLLED_THREAD_STORAGE_FAILURE');
        return original.call(this, key, value);
      };
    }
  }, {
    localeId: locale,
    predecessorValue: predecessor,
    chapterValue: chapter,
    threadSerialized: thread ? serializeReturningThread(thread) : null,
    localChapterProgress: chapterProgress,
    contributed: chapterContributed,
    owner: chapterOwner,
    malformed: malformedThread,
    blockThreadStorage: failThreadStorage,
    localeKey: LOCALE_KEY,
    eventStorageKey: LIVING_WORLD_STORAGE_KEY,
    chapterStorageKey: LIVING_WORLD_CHAPTER_STORAGE_KEY,
    chapterOwnerKey: LIVING_WORLD_CHAPTER_OWNER_KEY,
    threadStorageKey: RETURNING_THREAD_STORAGE_KEY,
  });
  return context;
}

async function noBlockingAxe(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('.chapter-primary:visible, .living-world-primary:visible').last();
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box?.width || 0, `${label}: primary width`).toBeGreaterThanOrEqual(44);
  expect(box?.height || 0, `${label}: primary height`).toBeGreaterThanOrEqual(44);
  await noBlockingAxe(page, label);
}

async function waitForEventNotch(page, index) {
  await page.waitForFunction(expected => {
    const root = document.querySelector('[data-living-world][data-route="event"]');
    return root?.dataset.windowIndex === String(expected) && root.dataset.notchActive === 'true';
  }, index, { timeout: 5000, polling: 'raf' });
}

async function completePredecessor(page) {
  const root = page.locator('[data-living-world][data-route="event"]');
  await page.locator('[data-start-thread]').click();
  for (let index = 0; index < 3; index += 1) {
    await waitForEventNotch(page, index);
    await page.locator('[data-living-world-lock]').click();
  }
  await expect(root).toHaveAttribute('data-phase', 'impact', { timeout: 5000 });
  await expect(root).toHaveAttribute('data-phase', 'complete', { timeout: 5000 });
}

async function waitForChapterNotch(page, index) {
  await page.waitForFunction(expected => {
    const root = document.querySelector('[data-living-chapter][data-route="chapter"]');
    return root?.dataset.windowIndex === String(expected) && root.dataset.notchActive === 'true';
  }, index, { timeout: 5000, polling: 'raf' });
}

async function completeChapter(page, { keyboard = false } = {}) {
  const root = page.locator('[data-living-chapter][data-route="chapter"]');
  await page.locator('[data-start-signal]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForChapterNotch(page, index);
    if (keyboard) await page.keyboard.press('Space');
    else await page.locator('[data-tune-signal]').click();
  }
  await expect(root).toHaveAttribute('data-phase', 'impact', { timeout: 5000 });
}

test('one accepted predecessor creates a thread that reaches exactly one follow-up lantern', async ({ browser }) => {
  const predecessor = makePredecessor({ progress: 11 });
  const context = await createContext(browser, { locale: 'en', viewport: VIEWPORTS[1] });
  const page = await context.newPage();
  await page.goto(eventUrl(predecessor));
  await completePredecessor(page);
  await expect(page.locator('[data-returning-thread="predecessor"]')).toHaveCount(1);
  await expect(page.locator('[data-returning-thread-copy]')).toContainText('Your thread');
  const storedThread = await page.evaluate(key => localStorage.getItem(key), RETURNING_THREAD_STORAGE_KEY);
  expect(storedThread).toContain('predecessorEventId');
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-original-accepted-first-thread.png', fullPage: true });

  const completed = { ...predecessor, progress: 12 };
  const followUp = makeChapter({ predecessor: completed, progress: 3 });
  await page.goto(chapterUrl(followUp));
  await expect(page.locator('[data-returning-thread="chapter"]')).toHaveCount(1);
  await expect(page.locator('[data-returning-thread-label]')).toHaveText('Your thread');
  await expect(page.locator('.returning-thread-extension')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-returning-follow-up-ready.png', fullPage: true });
  await expectQuality(page, 'returning-ready');

  await page.locator('[data-start-signal]').click();
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'active');
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-active-thread-extension.png', fullPage: true });
  for (let index = 0; index < 3; index += 1) {
    await waitForChapterNotch(page, index);
    await page.keyboard.press('Space');
  }
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'impact', { timeout: 5000 });
  await expect(page.locator('.returning-thread-extension')).toHaveCount(1);
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-accepted-lantern-impact.png', fullPage: true });
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'result', { timeout: 5000 });
  await expect(page.locator('.chapter-result-copy p')).toHaveText('Your thread reached the lantern');
  const threadAfter = await page.evaluate(key => localStorage.getItem(key), RETURNING_THREAD_STORAGE_KEY);
  expect(threadAfter).toBe(storedThread);

  await page.reload();
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'duplicate');
  await expect(page.locator('.returning-thread-extension')).toHaveCount(1);
  const chapterStore = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LIVING_WORLD_CHAPTER_STORAGE_KEY);
  expect(chapterStore.chapters[0].progress).toBe(4);
  await context.close();
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} returning chapter remains world-first and responsive`, async ({ browser }) => {
      const predecessor = makePredecessor();
      const followUp = makeChapter({ predecessor, progress: 2 });
      const context = await createContext(browser, {
        locale: locale.id,
        viewport,
        predecessor,
        chapter: followUp,
        thread: threadFor(predecessor, viewport.width % 2 ? 'folded-braid' : 'notched-spine'),
      });
      const page = await context.newPage();
      await page.goto(chapterUrl(followUp));
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('[data-returning-thread-label]')).toHaveText(locale.label);
      await expect(page.locator('[data-returning-thread="chapter"]')).toHaveCount(1);
      await expect(page.locator('[data-start-signal]')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/profile|badge|streak|rank|ledger|receipt|dashboard|returning follower/iu);
      await page.screenshot({
        path: `test-results/living-world-returning-thread/${locale.id}-${viewport.width}x${viewport.height}-returning-ready.png`,
        fullPage: true,
      });
      await expectQuality(page, `${locale.id}-${viewport.width}-returning`);
      await context.close();
    });
  }
}

test('fresh context sees no personal strand and can complete the collective chapter', async ({ browser }) => {
  const predecessor = makePredecessor();
  const followUp = makeChapter({ predecessor, progress: 4 });
  const context = await createContext(browser, { locale: 'en', predecessor, chapter: followUp });
  const page = await context.newPage();
  await page.goto(chapterUrl(followUp));
  await expect(page.locator('[data-returning-thread], [data-returning-thread-label]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-fresh-follow-up-context.png', fullPage: true });
  await completeChapter(page);
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(5);
  await expect(page.locator('[data-returning-thread]')).toHaveCount(0);
  await context.close();
});

test('malformed continuity fails closed without damaging chapter contribution', async ({ browser }) => {
  const predecessor = makePredecessor();
  const followUp = makeChapter({ predecessor, progress: 1 });
  const context = await createContext(browser, {
    locale: 'en',
    viewport: VIEWPORTS[0],
    predecessor,
    chapter: followUp,
    thread: threadFor(predecessor),
    malformedThread: true,
  });
  const page = await context.newPage();
  await page.goto(chapterUrl(followUp));
  await expect(page.locator('[data-returning-thread]')).toHaveCount(0);
  await expect(page.locator('[data-returning-thread-recovery]')).toContainText('Thread unavailable on this device');
  await expect(page.locator('[data-start-signal]')).toBeVisible();
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-malformed-continuity-recovery.png', fullPage: true });
  await completeChapter(page);
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(2);
  await context.close();
});

test('thread write failure preserves accepted predecessor world and share action', async ({ browser }) => {
  const predecessor = makePredecessor({ progress: 11 });
  const context = await createContext(browser, { locale: 'en', failThreadStorage: true });
  const page = await context.newPage();
  await page.goto(eventUrl(predecessor));
  await completePredecessor(page);
  await expect(page.locator('[data-returning-thread]')).toHaveCount(0);
  await expect(page.locator('[data-returning-thread-recovery]')).toContainText('World saved; thread unavailable');
  await expect(page.locator('[data-result-action="share"]')).toBeVisible();
  const world = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LIVING_WORLD_STORAGE_KEY);
  expect(world.events[0].progress).toBe(12);
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-thread-storage-unavailable.png', fullPage: true });
  await context.close();
});

test('Arabic 320px at 200 percent keeps returning continuity, utilities, and action usable', async ({ browser }) => {
  const predecessor = makePredecessor();
  const followUp = makeChapter({ predecessor, progress: 5 });
  const context = await createContext(browser, {
    locale: 'ar',
    viewport: VIEWPORTS[0],
    predecessor,
    chapter: followUp,
    thread: threadFor(predecessor, 'twin-latch'),
  });
  const page = await context.newPage();
  await page.goto(chapterUrl(followUp));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.locator('[data-returning-thread-label]')).toHaveText('خيطك');
  await expect(page.locator('.chapter-creator')).toBeVisible();
  await expect(page.locator('.chapter-utilities')).toBeVisible();
  await expect(page.locator('[data-start-signal]')).toBeVisible();
  const metrics = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const elements = [...document.querySelectorAll('.chapter-creator, .chapter-utilities, [data-returning-thread-label], [data-start-signal]')];
    return {
      overflow: document.documentElement.scrollWidth - viewport,
      bounds: elements.map(element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height, viewport };
      }),
    };
  });
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  for (const box of metrics.bounds) {
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(box.viewport + 1);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  }
  await page.screenshot({ path: 'test-results/living-world-returning-thread/ar-320x568-returning-200-percent.png', fullPage: true });
  await noBlockingAxe(page, 'ar-320-returning-200');
  await context.close();
});

test('completed light-field keeps one restrained inherited thread and thread-aware share media', async ({ browser }) => {
  const predecessor = makePredecessor();
  const followUp = makeChapter({ predecessor, progress: 7 });
  const context = await createContext(browser, {
    locale: 'en',
    viewport: VIEWPORTS[1],
    predecessor,
    chapter: followUp,
    thread: threadFor(predecessor, 'folded-braid'),
    chapterProgress: 8,
    chapterContributed: true,
    chapterOwner: true,
  });
  const page = await context.newPage();
  await page.goto(chapterUrl(followUp, 7));
  await expect(page.locator('[data-living-chapter]')).toHaveAttribute('data-phase', 'complete');
  await expect(page.locator('.far-shore-world')).toHaveClass(/is-complete/u);
  await expect(page.locator('[data-returning-thread="chapter"]')).toHaveCount(1);
  await expect(page.locator('.returning-thread-extension')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-completed-light-field-restrained-thread.png', fullPage: true });

  await page.locator('[data-chapter-share]').click();
  const dialog = page.locator('[data-returning-thread-share-dialog]');
  await expect(dialog).toBeVisible();
  const image = dialog.locator('img');
  await expect(image).toHaveAttribute('width', '270');
  await expect(image).toHaveAttribute('height', '480');
  await page.screenshot({ path: 'test-results/living-world-returning-thread/en-returning-thread-share-composition.png', fullPage: true });
  await dialog.locator('[data-returning-thread-copy]').click();
  const copied = await page.evaluate(() => sessionStorage.getItem('__returning_thread_clipboard'));
  expect(copied).toContain('#world-chapter=');
  expect(copied).not.toContain('returning-thread');

  const fresh = await createContext(browser, { locale: 'en' });
  const recipient = await fresh.newPage();
  await recipient.goto(copied);
  await expect(recipient.locator('[data-returning-thread], [data-returning-thread-label]')).toHaveCount(0);
  await expect(recipient.locator('.signal-lantern.is-active')).toHaveCount(8);
  await context.close();
  await fresh.close();
});
