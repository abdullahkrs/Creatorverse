import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
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
let sequence = 270000;

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

async function readCreatorHeader(page) {
  return page.evaluate(() => {
    const creator = document.querySelector('.chapter-creator');
    const name = creator?.querySelector('span');
    const context = creator?.querySelector('small');
    const utilities = document.querySelector('.chapter-utilities');
    if (!creator || !name || !utilities) return null;

    const textNode = [...name.childNodes]
      .find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (!textNode) return null;

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const lineRects = [...range.getClientRects()]
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({ width: rect.width, height: rect.height }));
    const nameRect = name.getBoundingClientRect();
    const creatorRect = creator.getBoundingClientRect();
    const utilitiesRect = utilities.getBoundingClientRect();
    const style = getComputedStyle(name);
    const contextStyle = context ? getComputedStyle(context) : null;

    return {
      text: textNode.textContent.trim(),
      lineCount: lineRects.length,
      minimumLineWidth: lineRects.length
        ? Math.min(...lineRects.map(rect => rect.width))
        : 0,
      nameWidth: nameRect.width,
      nameHeight: nameRect.height,
      creatorWidth: creatorRect.width,
      creatorBottom: creatorRect.bottom,
      utilitiesTop: utilitiesRect.top,
      clippedInline: name.scrollWidth > name.clientWidth + 1,
      clippedBlock: name.scrollHeight > name.clientHeight + 1,
      whiteSpace: style.whiteSpace,
      wordBreak: style.wordBreak,
      overflowWrap: style.overflowWrap,
      contextVisible: Boolean(contextStyle && contextStyle.display !== 'none'),
    };
  });
}

async function assertCreatorHeader(page, label) {
  const header = await readCreatorHeader(page);
  expect(header, `${label}: creator header exists`).not.toBeNull();
  expect(header.text.length, `${label}: creator name present`).toBeGreaterThan(0);
  expect(header.lineCount, `${label}: creator name stays on one line`).toBe(1);
  expect(header.minimumLineWidth, `${label}: creator name avoids a narrow vertical column`).toBeGreaterThanOrEqual(40);
  expect(header.nameWidth, `${label}: creator name receives bounded readable width`).toBeGreaterThanOrEqual(96);
  expect(header.creatorWidth, `${label}: creator row uses the available header width`).toBeGreaterThanOrEqual(180);
  expect(header.clippedInline, `${label}: creator name not horizontally clipped`).toBe(false);
  expect(header.clippedBlock, `${label}: creator name not vertically clipped`).toBe(false);
  expect(header.whiteSpace, `${label}: creator name does not wrap`).toBe('nowrap');
  expect(header.wordBreak, `${label}: creator name keeps word integrity`).toBe('keep-all');
  expect(header.overflowWrap, `${label}: creator name does not break arbitrarily`).toBe('normal');
  expect(header.contextVisible, `${label}: secondary context yields before creator-name integrity`).toBe(false);
  expect(header.creatorBottom, `${label}: utilities use a separate row`).toBeLessThanOrEqual(header.utilitiesTop + 1);
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
  test(`${locale.id} 320x568 at 200 percent text keeps the creator name intact before and after impact`, async ({ browser }) => {
    const context = await createContext(browser, locale.id);
    const page = await context.newPage();
    await page.goto(relayUrl(makeRelay()));
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

    const root = page.locator('[data-living-light-relay][data-route="relay"]');
    await expect(root).toHaveAttribute('data-relay-text-scale', 'large-phone');
    await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
    await assertCreatorHeader(page, `${locale.id}-ready`);
    await page.screenshot({
      path: `${OUTPUT}/relay-focus-${locale.id}-320x568-200-percent-header-ready.png`,
      fullPage: false,
    });

    await completeWithKeyboard(page);
    await assertCreatorHeader(page, `${locale.id}-impact`);
    await page.screenshot({
      path: `${OUTPUT}/relay-focus-${locale.id}-320x568-200-percent-header-impact.png`,
      fullPage: false,
    });

    await context.close();
  });
}
