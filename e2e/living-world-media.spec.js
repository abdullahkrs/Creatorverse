import { webcrypto } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildLivingWorldUrl, createLivingWorldEvent, LIVING_WORLD_STORAGE_KEY } from '../src/living-world-event.js';
import { LIVING_WORLD_MEDIA_FILENAME } from '../src/living-world-media.js';
import { getLivingWorldMediaCopy } from '../src/living-world-media-i18n.js';

mkdirSync('test-results/living-world-media', { recursive: true });
test.setTimeout(240_000);

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
let sequence = 5100;

function makeEvent({ progress = 15, target = 24 } = {}) {
  const suffix = String(sequence++).padStart(24, '0');
  return createLivingWorldEvent({ duration: '24h', target }, {
    now: Date.now(),
    cryptoLike: webcrypto,
    eventId: `event_${suffix}`,
    creatorName: 'Noura',
    progress,
  });
}

function eventUrl(value) {
  const absolute = buildLivingWorldUrl(value, { baseUrl: 'https://example.test/' });
  return `/${new URL(absolute).hash}`;
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  nativeShare = 'unsupported',
  clipboard = 'success',
  reducedMotion = 'reduce',
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, acceptDownloads: true });
  await context.addInitScript(({ localeId, shareMode, clipboardMode }) => {
    localStorage.setItem('creatorverse-locale', localeId);
    window.__CREATORVERSE_LIVING_WORLD_WINDOW_MS__ = 240;
    window.__CREATORVERSE_LIVING_WORLD_IMPACT_MS__ = 80;

    if (shareMode === 'unsupported') {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    } else {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: payload => Array.isArray(payload?.files) && payload.files.length === 1,
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async payload => {
          sessionStorage.setItem('__media_share_payload', JSON.stringify({
            title: payload.title,
            text: payload.text,
            url: payload.url,
            files: payload.files.map(file => ({ name: file.name, type: file.type, size: file.size })),
          }));
          if (shareMode === 'cancel') throw new DOMException('cancelled', 'AbortError');
          if (shareMode === 'denied') throw new DOMException('denied', 'NotAllowedError');
        },
      });
    }

    if (clipboardMode === 'unavailable') {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async value => {
            if (clipboardMode === 'denied') throw new DOMException('denied', 'NotAllowedError');
            sessionStorage.setItem('__media_clipboard', value);
          },
        },
      });
    }
  }, { localeId: locale, shareMode: nativeShare, clipboardMode: clipboard });
  return context;
}

async function waitForNotch(page, index) {
  await page.waitForFunction(expectedIndex => {
    const root = document.querySelector('[data-living-world][data-route="event"]');
    return root?.dataset.windowIndex === String(expectedIndex) && root.dataset.notchActive === 'true';
  }, index, { timeout: 5000, polling: 'raf' });
}

async function completeContribution(page) {
  const root = page.locator('[data-living-world][data-route="event"]');
  await page.locator('[data-start-thread]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  for (let index = 0; index < 3; index += 1) {
    await waitForNotch(page, index);
    await page.locator('[data-living-world-lock]').click();
  }
  await expect(root).toHaveAttribute('data-phase', /result|complete/u, { timeout: 5000 });
}

async function blockingAxe(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(blocking, `${label}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

async function decodedPreviewMetrics(page) {
  return page.locator('[data-living-media-dialog] img').evaluate(async image => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const background = pixels.slice(0, 4).join(',');
    let opaque = 0;
    let sceneDifferent = 0;
    let checksum = 2166136261;
    const colors = new Set();
    for (let y = 0; y < canvas.height; y += 16) {
      for (let x = 0; x < canvas.width; x += 16) {
        const offset = (y * canvas.width + x) * 4;
        const rgba = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]},${pixels[offset + 3]}`;
        if (pixels[offset + 3] > 0) opaque += 1;
        if (y >= 250 && y < 1690 && rgba !== background) sceneDifferent += 1;
        colors.add(rgba);
        checksum ^= pixels[offset] + (pixels[offset + 1] << 8) + (pixels[offset + 2] << 16);
        checksum = Math.imul(checksum, 16777619) >>> 0;
      }
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      opaque,
      sceneDifferent,
      uniqueColors: colors.size,
      checksum,
    };
  });
}

function inspectPng(path, forbidden = []) {
  const bytes = readFileSync(path);
  assertPngSignature(bytes);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    chunks.push(type);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  expect(width).toBe(1080);
  expect(height).toBe(1920);
  expect(bytes.length).toBeGreaterThan(1024);
  expect(chunks).not.toContain('tEXt');
  expect(chunks).not.toContain('iTXt');
  expect(chunks).not.toContain('zTXt');
  const text = bytes.toString('latin1');
  for (const value of forbidden) expect(text).not.toContain(value);
}

function assertPngSignature(bytes) {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}

async function openFallback(page) {
  const button = page.locator('[data-living-share], [data-result-action="share"]');
  await expect(button).toHaveText(getLivingWorldMediaCopy(await page.evaluate(() => localStorage.getItem('creatorverse-locale'))).action);
  await button.click();
  const dialog = page.locator('[data-living-media-dialog]');
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-living-media-save]')).toBeFocused();
  return { button, dialog };
}

for (const locale of LOCALES) {
  test(`${locale.id} exports exact partial and completed portrait world media`, async ({ browser }) => {
    const checksums = [];
    for (const state of ['partial', 'complete']) {
      const value = makeEvent({ progress: state === 'partial' ? 15 : 23, target: 24 });
      const context = await createContext(browser, { locale: locale.id });
      const page = await context.newPage();
      await page.goto(eventUrl(value));
      await completeContribution(page);
      await openFallback(page);

      const metrics = await decodedPreviewMetrics(page);
      expect(metrics.width).toBe(1080);
      expect(metrics.height).toBe(1920);
      expect(metrics.opaque).toBeGreaterThan(7000);
      expect(metrics.sceneDifferent).toBeGreaterThan(2000);
      expect(metrics.uniqueColors).toBeGreaterThan(8);
      checksums.push(metrics.checksum);

      const downloadPromise = page.waitForEvent('download');
      await page.locator('[data-living-media-save]').click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(LIVING_WORLD_MEDIA_FILENAME);
      const path = `test-results/living-world-media/share-${locale.id}-${state}-1080x1920.png`;
      await download.saveAs(path);
      inspectPng(path, [value.eventId, '#world-event=', 'creatorverse-living-world-v1']);
      await context.close();
    }
    expect(checksums[0]).not.toBe(checksums[1]);
  });
}

test('native file sharing sends exactly one PNG and the strict event URL without mutation', async ({ browser }) => {
  const context = await createContext(browser, { nativeShare: 'success' });
  const page = await context.newPage();
  const value = makeEvent({ progress: 8, target: 12 });
  await page.goto(eventUrl(value));
  await completeContribution(page);
  const before = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY);
  const button = page.locator('[data-result-action="share"]');
  await button.click();
  await expect(page.locator('[data-living-media-dialog]')).toHaveCount(0);
  const payload = JSON.parse(await page.evaluate(() => sessionStorage.getItem('__media_share_payload')));
  expect(payload.files).toHaveLength(1);
  expect(payload.files[0].name).toBe(LIVING_WORLD_MEDIA_FILENAME);
  expect(payload.files[0].type).toBe('image/png');
  expect(payload.files[0].size).toBeGreaterThan(1024);
  expect(payload.url).toContain('#world-event=');
  expect(payload.url).not.toContain('?');
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY)).toBe(before);
  await context.close();
});

test('native share cancellation is neutral and restores focus', async ({ browser }) => {
  const context = await createContext(browser, { nativeShare: 'cancel' });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await completeContribution(page);
  const button = page.locator('[data-result-action="share"]');
  await button.click();
  await expect(page.locator('[data-living-media-dialog]')).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(page.locator('[data-living-status]')).toHaveText('');
  await context.close();
});

test('denied native share falls back to save and copy without progress mutation', async ({ browser }) => {
  const context = await createContext(browser, { nativeShare: 'denied' });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await completeContribution(page);
  const before = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY);
  const { dialog } = await openFallback(page);
  await expect(dialog.locator('[data-living-media-status]')).toContainText(getLivingWorldMediaCopy('en').copied);
  expect(await page.evaluate(() => sessionStorage.getItem('__media_clipboard'))).toContain('#world-event=');
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY)).toBe(before);
  await context.close();
});

test('clipboard denial preserves save and reveals one selectable safe link', async ({ browser }) => {
  const context = await createContext(browser, { clipboard: 'denied' });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await completeContribution(page);
  const { dialog } = await openFallback(page);
  await expect(dialog.locator('[data-living-media-save]')).toBeVisible();
  const manual = dialog.locator('[data-living-media-manual] input');
  await expect(manual).toBeVisible();
  await expect(manual).toHaveValue(/#world-event=/u);
  await expect(dialog.locator('[data-living-media-status]')).toHaveText(getLivingWorldMediaCopy('en').manual);
  await context.close();
});

test('generation failure is bounded and retry succeeds without changing progress', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.addInitScript(() => { window.__CREATORVERSE_MEDIA_FORCE_ERROR__ = true; });
  await page.goto(eventUrl(makeEvent()));
  await completeContribution(page);
  const before = await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY);
  const button = page.locator('[data-result-action="share"]');
  await button.click();
  await expect(button).toHaveText(getLivingWorldMediaCopy('en').retry);
  await expect(page.locator('[data-living-status]')).toHaveText(getLivingWorldMediaCopy('en').generationError);
  await page.evaluate(() => { window.__CREATORVERSE_MEDIA_FORCE_ERROR__ = false; });
  await button.click();
  await expect(page.locator('[data-living-media-dialog]')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), LIVING_WORLD_STORAGE_KEY)).toBe(before);
  await context.close();
});

test('fallback Escape closes predictably and returns focus to Share update', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await completeContribution(page);
  const { button, dialog } = await openFallback(page);
  await blockingAxe(page, 'fallback-dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await context.close();
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} result and fallback remain responsive`, async ({ browser }) => {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(eventUrl(makeEvent()));
      await completeContribution(page);
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await page.screenshot({
        path: `test-results/living-world-media/${locale.id}-${viewport.width}x${viewport.height}-result.png`,
        fullPage: true,
      });
      await openFallback(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await blockingAxe(page, `${locale.id}-${viewport.width}-fallback`);
      await page.screenshot({
        path: `test-results/living-world-media/${locale.id}-${viewport.width}x${viewport.height}-fallback.png`,
        fullPage: true,
      });
      await context.close();
    });
  }
}

test('320px fallback remains usable at 200 percent text zoom', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'ar', viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await completeContribution(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const { dialog } = await openFallback(page);
  await expect(dialog.locator('[data-living-media-save]')).toBeVisible();
  await expect(dialog.locator('[data-living-media-copy]')).toBeVisible();
  const close = dialog.locator('.living-world-media-close');
  const closeBox = await close.boundingBox();
  expect(closeBox?.width || 0).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height || 0).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: 'test-results/living-world-media/ar-320x568-fallback-200-percent.png',
    fullPage: true,
  });
  await context.close();
});

test('creator owner view exports partial and completed state without admin surfaces', async ({ browser }) => {
  for (const progress of [6, 12]) {
    const value = makeEvent({ progress, target: 12 });
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(eventUrl(value));
    await page.evaluate(eventId => sessionStorage.setItem('creatorverse-living-world-owner-v1', eventId), value.eventId);
    await page.reload();
    await expect(page.locator('[data-living-share]')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/ledger|receipt|provenance|dashboard|analytics/iu);
    await openFallback(page);
    await expect(page.locator('[data-living-media-dialog] img')).toHaveAttribute('alt', progress === 12 ? /fully lit/u : /partly lit/u);
    await context.close();
  }
});

test('invalid event recovery never exposes artifact controls', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto('/#world-event=hostile%3Cscript%3E');
  await expect(page.locator('[data-living-world][data-route="recovery"]')).toBeVisible();
  await expect(page.locator(SHARE_SELECTOR)).toHaveCount(0);
  await expect(page.locator('[data-living-media-dialog]')).toHaveCount(0);
  await context.close();
});

const SHARE_SELECTOR = '[data-living-share], [data-result-action="share"]';
