import { webcrypto } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { buildLivingWorldUrl, createLivingWorldEvent } from '../src/living-world-event.js';
import { LIVING_WORLD_MEDIA_OUTCOME_SAFE_BOUNDS } from '../src/living-world-media.js';

mkdirSync('test-results/living-world-media', { recursive: true });
test.setTimeout(180_000);

let sequence = 9000;

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

async function createContext(browser, locale = 'ar') {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(localeId => {
    localStorage.setItem('creatorverse-locale', localeId);
    window.__CREATORVERSE_LIVING_WORLD_WINDOW_MS__ = 1200;
    window.__CREATORVERSE_LIVING_WORLD_IMPACT_MS__ = 500;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  }, locale);
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
  const lock = page.locator('[data-living-world-lock]');
  await page.locator('[data-start-thread]').click();
  await expect(root).toHaveAttribute('data-phase', 'active');
  await waitForNotch(page, 0);
  await lock.click();
  await waitForNotch(page, 1);
  await lock.click();
  await waitForNotch(page, 2);
  await lock.click();
  await expect(root).toHaveAttribute('data-phase', /result|complete/u, { timeout: 5000 });
}

function overlaps(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function expectInsideViewport(box, viewport, label) {
  expect(box, `${label} has no layout box`).not.toBeNull();
  expect(box.x, `${label} starts before viewport`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} starts above viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} exceeds viewport inline edge`).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, `${label} exceeds viewport block edge`).toBeLessThanOrEqual(viewport.height);
}

test('Arabic 320px fallback keeps title, close, save, and copy visible at 200 percent text', async ({ browser }) => {
  const context = await createContext(browser, 'ar');
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent()));
  await completeContribution(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.locator('[data-result-action="share"]').click();

  const dialog = page.locator('[data-living-media-dialog]');
  await expect(dialog).toBeVisible();
  const title = dialog.locator('h2');
  const close = dialog.locator('.living-world-media-close');
  const save = dialog.locator('[data-living-media-save]');
  const copy = dialog.locator('[data-living-media-copy]');
  await expect(title).toBeVisible();
  await expect(close).toBeVisible();
  await expect(save).toBeVisible();
  await expect(copy).toBeVisible();

  const viewport = page.viewportSize();
  const [dialogBox, titleBox, closeBox, saveBox, copyBox] = await Promise.all([
    dialog.boundingBox(),
    title.boundingBox(),
    close.boundingBox(),
    save.boundingBox(),
    copy.boundingBox(),
  ]);
  for (const [box, label] of [
    [dialogBox, 'dialog'],
    [titleBox, 'title'],
    [closeBox, 'close'],
    [saveBox, 'save'],
    [copyBox, 'copy'],
  ]) expectInsideViewport(box, viewport, label);
  expect(overlaps(titleBox, closeBox), 'title overlaps close control').toBe(false);
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  expect(saveBox.height).toBeGreaterThanOrEqual(44);
  expect(copyBox.height).toBeGreaterThanOrEqual(44);
  expect(await dialog.evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: 'test-results/living-world-media/ar-320x568-fallback-200-percent-qa-fix.png',
    fullPage: true,
  });
  await context.close();
});

test('portrait energy seam stays outside the authored outcome and invitation safe zone', async ({ browser }) => {
  const context = await createContext(browser, 'en');
  const page = await context.newPage();
  await page.goto(eventUrl(makeEvent({ progress: 15, target: 24 })));
  await completeContribution(page);
  await page.locator('[data-result-action="share"]').click();
  const image = page.locator('[data-living-media-dialog] img');
  await expect(image).toBeVisible();

  const metrics = await image.evaluate(async (node, bounds) => {
    await node.decode();
    const canvas = document.createElement('canvas');
    canvas.width = node.naturalWidth;
    canvas.height = node.naturalHeight;
    const context2d = canvas.getContext('2d', { willReadFrequently: true });
    context2d.drawImage(node, 0, 0);
    const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
    const isEnergy = offset => pixels[offset] >= 238
      && pixels[offset + 1] >= 195
      && pixels[offset + 2] >= 90
      && pixels[offset + 2] <= 190
      && pixels[offset + 3] > 0;
    let worldEnergyPixels = 0;
    let safeZoneEnergyPixels = 0;
    for (let y = 250; y < 1540; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const offset = (y * canvas.width + x) * 4;
        if (isEnergy(offset)) worldEnergyPixels += 1;
      }
    }
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (isEnergy(offset)) safeZoneEnergyPixels += 1;
      }
    }
    return { width: canvas.width, height: canvas.height, worldEnergyPixels, safeZoneEnergyPixels };
  }, LIVING_WORLD_MEDIA_OUTCOME_SAFE_BOUNDS);

  expect(metrics.width).toBe(1080);
  expect(metrics.height).toBe(1920);
  expect(metrics.worldEnergyPixels).toBeGreaterThan(100);
  expect(metrics.safeZoneEnergyPixels).toBe(0);
  await context.close();
});
