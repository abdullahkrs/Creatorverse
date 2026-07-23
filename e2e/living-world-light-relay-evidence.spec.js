import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
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

const OUTPUT = 'test-results/living-world-light-relay';
const LOCALE_KEY = 'creatorverse-locale';
const VIEWPORT = { width: 390, height: 844 };
const LOCALES = ['en', 'ar'];

mkdirSync(OUTPUT, { recursive: true });
test.setTimeout(240_000);

let sequence = 120000;

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
  chapter = null,
  chapterProgress = null,
  chapterContributed = false,
  chapterOwner = false,
  reducedMotion = 'no-preference',
} = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion, hasTouch: true });
  const predecessorEventId = chapter
    ? decodeLivingWorldEvent(chapter.predecessor, { allowExpired: true }).eventId
    : null;

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
    window.__CREATORVERSE_RELAY_WINDOW_MS__ = 700;
    window.__CREATORVERSE_RELAY_IMPACT_MS__ = 2500;
    window.__CREATORVERSE_CHAPTER_WINDOW_MS__ = 700;
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

async function screenshot(page, locale, state) {
  await page.screenshot({
    path: `${OUTPUT}/relay-evidence-${locale}-${state}-390x844.png`,
    fullPage: true,
  });
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 7000, polling: 'raf' });
}

async function captureRelayJourney(browser, locale) {
  const chapter = makeChapter(3);
  const relay = createLivingWorldLightRelay(chapter, 3);
  const context = await createContext(browser, { locale });
  const page = await context.newPage();
  const root = page.locator('[data-living-light-relay][data-route="relay"]');

  await page.goto(relayUrl(relay));
  await expect(root).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('[data-light-relay-strand="unfinished"]')).toBeVisible();
  await screenshot(page, locale, 'world-ready');

  await page.locator('[data-start-relay]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  await screenshot(page, locale, 'active-contribution');

  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await page.locator('[data-tune-relay]').click();
  }

  await expect(root).toHaveAttribute('data-phase', 'impact', { timeout: 7000 });
  await expect(page.locator('[data-light-relay-strand="connected"]')).toBeVisible();
  await screenshot(page, locale, 'energy-impact');

  await expect(root).toHaveAttribute('data-phase', 'result', { timeout: 7000 });
  await expect(page.locator('.signal-lantern.is-active')).toHaveCount(4);
  await screenshot(page, locale, 'accepted-lantern');

  await page.reload();
  await expect(root).toHaveAttribute('data-phase', 'stale');
  await screenshot(page, locale, 'stale-recovery');

  await context.close();
}

async function captureShareAndRecovery(browser, locale) {
  const partial = makeChapter(4);
  const partialContext = await createContext(browser, {
    locale,
    chapter: partial,
    chapterProgress: 4,
    chapterContributed: false,
    chapterOwner: true,
  });
  const partialPage = await partialContext.newPage();
  await partialPage.goto(chapterUrl(partial, 4));
  const shareButton = partialPage.locator('[data-chapter-share]');
  await expect(shareButton).toBeEnabled({ timeout: 20_000 });
  await shareButton.click();
  const preview = partialPage.locator('[data-light-relay-share-dialog]');
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('img')).toHaveAttribute('src', /^blob:/u, { timeout: 30_000 });
  await screenshot(partialPage, locale, 'partial-result-relay-preview');
  await preview.locator('img').screenshot({
    path: `${OUTPUT}/relay-evidence-${locale}-portrait-share-composition.png`,
  });
  await partialContext.close();

  const completed = makeChapter(8);
  const completedContext = await createContext(browser, {
    locale,
    chapter: completed,
    chapterProgress: 8,
    chapterContributed: true,
    chapterOwner: true,
  });
  const completedPage = await completedContext.newPage();
  await completedPage.goto(chapterUrl(completed, 8));
  await expect(completedPage.locator('[data-light-relay-strand]')).toHaveCount(0);
  await expect(completedPage.locator('[data-light-relay-share-dialog]')).toHaveCount(0);
  await screenshot(completedPage, locale, 'completed-chapter-no-relay');
  await completedContext.close();

  const invalidContext = await createContext(browser, { locale });
  const invalidPage = await invalidContext.newPage();
  await invalidPage.goto('/#world-relay=event_bad%3Cscript%3E');
  await expect(invalidPage.locator('[data-living-light-relay][data-route="recovery"]')).toBeVisible();
  await screenshot(invalidPage, locale, 'invalid-link-recovery');
  await invalidContext.close();
}

for (const locale of LOCALES) {
  test(`${locale} captures every required one-step light relay evidence state`, async ({ browser }) => {
    await captureRelayJourney(browser, locale);
    await captureShareAndRecovery(browser, locale);
  });
}
