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
  LIVING_WORLD_SKYWELL_OWNER_KEY,
  LIVING_WORLD_SKYWELL_STORAGE_KEY,
} from '../src/living-world-skywell.js';

mkdirSync('test-results/living-world-skywell', { recursive: true });
test.setTimeout(180_000);

const LOCALE_KEY = 'creatorverse-locale';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', title: 'Open the Skywell', action: 'Carry light' },
  { id: 'ar', dir: 'rtl', title: 'افتحوا نافذة السماء', action: 'احمل النور' },
];
let sequence = 30000;
function opaque(prefix) { return `${prefix}_${String(sequence++).padStart(24, '0')}`; }

function makeChapter({ progress = 8 } = {}) {
  const now = Date.now();
  const event = createLivingWorldEvent({ duration: '24h', target: 12 }, {
    now,
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
  return createLivingWorldChapter(event, { duration: '24h' }, {
    now,
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress,
  });
}

function makeSkywell({ progress = 0, predecessor = makeChapter() } = {}) {
  return createLivingWorldSkywell(predecessor, {
    now: Date.now(),
    cryptoLike: webcrypto,
    skywellId: opaque('skywell'),
    progress,
  });
}

function tokenParam(token, key) {
  return new URLSearchParams(Buffer.from(token, 'base64url').toString('utf8')).get(key);
}
function localUrl(absolute) {
  const parsed = new URL(absolute);
  return `/${parsed.hash}`;
}
function chapterUrl(value) {
  return localUrl(buildLivingWorldChapterUrl(value, { progress: value.progress, baseUrl: 'https://example.test/' }));
}
function skywellUrl(value, progress = value.progress) {
  return localUrl(buildLivingWorldSkywellUrl(value, { progress, baseUrl: 'https://example.test/' }));
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  reducedMotion = 'reduce',
  chapter = null,
  owner = false,
  skywellState = null,
  skywellOwner = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const chapterPredecessorEventId = chapter ? tokenParam(chapter.predecessor, 'eventId') : null;
  await context.addInitScript(({
    localeId,
    chapterValue,
    chapterPredecessorEventIdValue,
    ownerValue,
    skywellStateValue,
    skywellOwnerValue,
    localeKey,
    chapterStorageKey,
    chapterOwnerKey,
    skywellStorageKey,
    skywellOwnerKey,
  }) => {
    localStorage.setItem(localeKey, localeId);
    window.__CREATORVERSE_SKYWELL_WINDOW_MS__ = 320;
    window.__CREATORVERSE_SKYWELL_IMPACT_MS__ = 120;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    if (chapterValue) {
      localStorage.setItem(chapterStorageKey, JSON.stringify({
        version: 1,
        chapters: [{
          chapterId: chapterValue.chapterId,
          predecessorEventId: chapterPredecessorEventIdValue,
          target: 8,
          progress: 8,
          contributed: true,
        }],
      }));
      if (ownerValue) sessionStorage.setItem(chapterOwnerKey, chapterValue.chapterId);
    }
    if (skywellStateValue) {
      localStorage.setItem(skywellStorageKey, JSON.stringify({
        version: 1,
        skywells: [skywellStateValue],
      }));
    }
    if (skywellOwnerValue) sessionStorage.setItem(skywellOwnerKey, skywellOwnerValue);
  }, {
    localeId: locale,
    chapterValue: chapter,
    chapterPredecessorEventIdValue: chapterPredecessorEventId,
    ownerValue: owner,
    skywellStateValue: skywellState,
    skywellOwnerValue: skywellOwner,
    localeKey: LOCALE_KEY,
    chapterStorageKey: LIVING_WORLD_CHAPTER_STORAGE_KEY,
    chapterOwnerKey: LIVING_WORLD_CHAPTER_OWNER_KEY,
    skywellStorageKey: LIVING_WORLD_SKYWELL_STORAGE_KEY,
    skywellOwnerKey: LIVING_WORLD_SKYWELL_OWNER_KEY,
  });
  return context;
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-skywell-root][data-route="skywell"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 6000, polling: 'raf' });
}

async function completeContribution(page, { keyboard = false } = {}) {
  const root = page.locator('[data-skywell-root][data-route="skywell"]');
  await page.locator('[data-skywell-start]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    if (keyboard) await page.keyboard.press('Space');
    else await page.locator('[data-skywell-align]').click();
  }
  await expect(root).toHaveAttribute('data-phase', 'impact', { timeout: 6000 });
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('.skywell-primary:visible').last();
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box?.width || 0, `${label}: primary width`).toBeGreaterThanOrEqual(44);
  expect(box?.height || 0, `${label}: primary height`).toBeGreaterThanOrEqual(44);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function expectWorldGeometry(page, label) {
  const selectors = [
    '.skywell-creator-strip', '#skywell-title', '.skywell-progress',
    '.skywell-completed-bridge', '.skywell-completed-grove', '.skywell-central-support',
    '.skywell-canopy', '.skywell-rib.is-target, .skywell-world.is-complete .skywell-rib.is-open',
    '.skywell-primary:visible',
  ];
  const viewport = page.viewportSize();
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    await expect(locator, `${label}: ${selector}`).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${label}: ${selector} box`).not.toBeNull();
    expect(box.x + box.width, `${label}: ${selector} right`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.x, `${label}: ${selector} left`).toBeGreaterThanOrEqual(-1);
  }
}

test('completed Grove owner launches one compact Skywell continuation inside the world', async ({ browser }) => {
  const chapter = makeChapter();
  const context = await createContext(browser, { chapter, owner: true, viewport: VIEWPORTS[1] });
  const page = await context.newPage();
  await page.goto(chapterUrl(chapter));
  const cluster = page.locator('[data-skywell-launch-cluster]');
  await expect(cluster).toBeVisible();
  await expect(cluster).toContainText('Next event');
  await expect(cluster).toContainText('Open the Skywell');
  await expect(cluster).toContainText('Six ribs closed');
  await expect(cluster.locator('[data-launch-skywell]')).toHaveText('Launch event');
  await page.screenshot({ path: 'test-results/living-world-skywell/en-390x844-creator-launch.png', fullPage: true });
  await cluster.locator('[data-launch-skywell]').click();
  await expect(page.locator('[data-skywell-root][data-route="skywell"]')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#skywell');
  await expect(page.locator('[data-skywell-share]')).toBeVisible();
  await context.close();
});

test('followers and incomplete Grove contexts never expose creator launch', async ({ browser }) => {
  const complete = makeChapter();
  const follower = await createContext(browser, { chapter: complete, owner: false });
  const followerPage = await follower.newPage();
  await followerPage.goto(chapterUrl(complete));
  await expect(followerPage.locator('[data-skywell-launch-cluster]')).toHaveCount(0);
  await follower.close();

  const partial = makeChapter({ progress: 7 });
  const context = await createContext(browser, { chapter: partial, owner: true });
  const page = await context.newPage();
  await page.goto(chapterUrl(partial));
  await expect(page.locator('[data-skywell-launch-cluster]')).toHaveCount(0);
  await context.close();
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} enters the Skywell directly with one world-first action`, async ({ browser }) => {
      const value = makeSkywell({ progress: 2 });
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(skywellUrl(value));
      const root = page.locator('[data-skywell-root][data-route="skywell"]');
      await expect(root).toBeVisible();
      expect(new URL(page.url()).hash).toBe('#skywell');
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('#skywell-title')).toHaveText(locale.title);
      await expect(page.locator('[data-skywell-start]')).toHaveText(locale.action);
      await expect(page.locator('.skywell-rib')).toHaveCount(6);
      await expect(page.locator('.skywell-rib.is-open')).toHaveCount(2);
      await expect(page.locator('.skywell-rib.is-target')).toHaveCount(1);
      await expectQuality(page, `${locale.id}-${viewport.width}-ready`);
      await expectWorldGeometry(page, `${locale.id}-${viewport.width}-geometry`);
      await page.screenshot({
        path: `test-results/living-world-skywell/${locale.id}-${viewport.width}x${viewport.height}-ready.png`,
        fullPage: true,
      });
      await context.close();
    });
  }
}

for (const progress of [1, 3, 5]) {
  test(`captures structural partial progress ${progress} of 6`, async ({ browser }) => {
    const value = makeSkywell({ progress });
    const context = await createContext(browser, { viewport: VIEWPORTS[1] });
    const page = await context.newPage();
    await page.goto(skywellUrl(value));
    await expect(page.locator('.skywell-rib.is-open')).toHaveCount(progress);
    await expect(page.locator('.skywell-rib.is-target')).toHaveCount(1);
    await page.screenshot({ path: `test-results/living-world-skywell/en-390x844-partial-${progress}.png`, fullPage: true });
    await context.close();
  });
}

test('touch contribution carries one structural trace and opens exactly the bound next rib', async ({ browser }) => {
  const value = makeSkywell({ progress: 2 });
  const context = await createContext(browser, { viewport: VIEWPORTS[1], reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto(skywellUrl(value));
  await page.locator('[data-skywell-start]').click();
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'active');
  await expect(page.locator('.skywell-energy-route')).toBeVisible();
  await page.screenshot({ path: 'test-results/living-world-skywell/en-390x844-active-trace.png', fullPage: true });
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await page.locator('[data-skywell-align]').click();
  }
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'impact');
  await expect(page.locator('.skywell-rib.is-open')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/living-world-skywell/en-390x844-rib-impact.png', fullPage: true });
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'result', { timeout: 6000 });
  await expect(page.locator('.skywell-result-copy')).toContainText('One rib opened');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LIVING_WORLD_SKYWELL_STORAGE_KEY);
  expect(stored.skywells[0].progress).toBe(3);
  await page.reload();
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'duplicate');
  await expect(page.locator('.skywell-rib.is-open')).toHaveCount(3);
  await context.close();
});

test('keyboard contribution opens the sixth rib and reveals the completed aperture', async ({ browser }) => {
  const value = makeSkywell({ progress: 5 });
  const context = await createContext(browser, { viewport: VIEWPORTS[4] });
  const page = await context.newPage();
  await page.goto(skywellUrl(value));
  await completeContribution(page, { keyboard: true });
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'complete', { timeout: 6000 });
  await expect(page.locator('.skywell-rib.is-open')).toHaveCount(6);
  await expect(page.locator('.skywell-world')).toHaveClass(/is-complete/u);
  await expect(page.locator('.skywell-light-column')).toBeVisible();
  await expect(page.locator('.skywell-result-copy')).toContainText('Bridge, grove, and sky connected');
  await page.screenshot({ path: 'test-results/living-world-skywell/en-1440x900-complete.png', fullPage: true });
  await context.close();
});

test('failed contribution preserves the exact rib state and exposes one retry', async ({ browser }) => {
  const value = makeSkywell({ progress: 3 });
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(skywellUrl(value));
  await page.locator('[data-skywell-start]').click();
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'failed', { timeout: 6000 });
  await expect(page.locator('.skywell-rib.is-open')).toHaveCount(3);
  await expect(page.locator('[data-skywell-result="retry"]')).toHaveText('Try again');
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_SKYWELL_STORAGE_KEY)).toBeNull();
  await context.close();
});

test('portrait fallback renders a real 1080 by 1920 update and sharing remains progress-neutral', async ({ browser }) => {
  const value = makeSkywell({ progress: 3 });
  const context = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(skywellUrl(value));
  await completeContribution(page);
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'result', { timeout: 6000 });
  const before = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_SKYWELL_STORAGE_KEY);
  await page.locator('[data-skywell-result="share"]').click();
  const dialog = page.locator('[data-skywell-share-dialog]');
  await expect(dialog).toBeVisible();
  const image = dialog.locator('img');
  const dimensions = await image.evaluate(async node => {
    await node.decode();
    return { width: node.naturalWidth, height: node.naturalHeight };
  });
  expect(dimensions).toEqual({ width: 1080, height: 1920 });
  await expect(dialog.locator('[data-skywell-save]')).toHaveAttribute('download', 'creatorverse-skywell.png');
  await page.screenshot({ path: 'test-results/living-world-skywell/ar-320x568-share.png', fullPage: true });
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_SKYWELL_STORAGE_KEY)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await context.close();
});

test('200 percent text preserves creator, utilities, title, target, and dominant action at 320 by 568', async ({ browser }) => {
  const value = makeSkywell({ progress: 4 });
  const context = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(skywellUrl(value));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expectQuality(page, 'ar-320-large-text');
  await expectWorldGeometry(page, 'ar-320-large-text');
  const creator = page.locator('.skywell-creator-strip');
  const title = page.locator('.skywell-title-block');
  const action = page.locator('[data-skywell-start]');
  const [creatorBox, titleBox, actionBox] = await Promise.all([creator.boundingBox(), title.boundingBox(), action.boundingBox()]);
  expect(creatorBox.y + creatorBox.height).toBeLessThanOrEqual(titleBox.y + 1);
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(568 + 1);
  await page.screenshot({ path: 'test-results/living-world-skywell/ar-320x568-200-percent.png', fullPage: true });
  await context.close();
});

test('reduced motion keeps the same structural meaning without travelling pulse', async ({ browser }) => {
  const value = makeSkywell({ progress: 2 });
  const context = await createContext(browser, { reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(skywellUrl(value));
  await completeContribution(page);
  await expect(page.locator('.skywell-rib.is-open')).toHaveCount(3);
  await expect(page.locator('.skywell-energy-pulse')).toBeHidden();
  await context.close();
});

test('stale local progress shows the authoritative world without allowing another mutation', async ({ browser }) => {
  const value = makeSkywell({ progress: 2 });
  const predecessorChapterId = tokenParam(value.predecessor, 'chapterId');
  const context = await createContext(browser, {
    skywellState: {
      skywellId: value.skywellId,
      predecessorChapterId,
      target: 6,
      progress: 4,
      contributed: true,
    },
  });
  const page = await context.newPage();
  await page.goto(skywellUrl(value));
  await expect(page.locator('[data-skywell-root]')).toHaveAttribute('data-phase', 'stale');
  await expect(page.locator('.skywell-rib.is-open')).toHaveCount(4);
  await expect(page.locator('[data-skywell-result="current"]')).toBeVisible();
  await context.close();
});

test('invalid event transport fails closed into one concise recovery world', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en', viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto('/#world-skywell=hostile');
  await expect(page.locator('[data-skywell-root][data-route="recovery"]')).toBeVisible();
  await expect(page.locator('#skywell-recovery-title')).toHaveText('This event link is unavailable');
  await expect(page.locator('.skywell-primary')).toHaveText('Return to world');
  await page.screenshot({ path: 'test-results/living-world-skywell/en-320x568-invalid.png', fullPage: true });
  await context.close();
});
