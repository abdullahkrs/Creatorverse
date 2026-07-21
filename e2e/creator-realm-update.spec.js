import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCompletionReceipt } from '../src/completion-receipt.js';

mkdirSync('test-results/creator-realm-update', { recursive: true });
test.setTimeout(180_000);

const REALM_ID = 'realm_abcdefghijklmnop';
const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  {
    id: 'en',
    dir: 'ltr',
    stages: { locked: 'Locked district', outpost: 'Signal outpost', connected: 'Connected quarter', illuminated: 'Illuminated district' },
    nextAction: 'Launch next mission',
    invalid: 'Realm unavailable',
  },
  {
    id: 'ar',
    dir: 'rtl',
    stages: { locked: 'الحيّ مقفل', outpost: 'نقطة إشارة', connected: 'حيّ مترابط', illuminated: 'حيّ مضاء' },
    nextAction: 'أطلق المهمة التالية',
    invalid: 'العالم غير متاح',
  },
];

function entry(index) {
  return {
    id: `receipt_${String(index).padStart(16, '0')}`,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    districtId: 'beacon-district',
    contribution: 3,
  };
}

function realm(count = 0, overrides = {}) {
  return {
    id: REALM_ID,
    name: 'Synthetic realm',
    theme: 'cosmic',
    total: count * 3,
    districtId: 'beacon-district',
    unlocked: count > 0,
    receipts: Array.from({ length: count }, (_, index) => entry(index)),
    ...overrides,
  };
}

function ledger(count = 0, overrides = {}) {
  return { version: 1, realms: [realm(count, overrides)] };
}

function receiptToken(index) {
  return createCompletionReceipt({
    realmId: REALM_ID,
    receiptId: `receipt_new${String(index).padStart(12, '0')}`,
    missionId: 'route-choice',
    roleId: index % 2 ? 'guardian' : 'builder',
    routeId: index % 2 ? 'ocean' : 'sky',
    contribution: 3,
    districtId: 'beacon-district',
  });
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  state = ledger(0),
  reducedMotion = 'reduce',
  share = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.addInitScript(({ localeId, serializedLedger, shareEnabled }) => {
    localStorage.setItem('creatorverse-locale', localeId);
    localStorage.setItem('creatorverse-creator-ledger-v1', serializedLedger);
    window.__realmUpdateClipboard = '';
    window.__realmUpdateClipboardMode = 'success';
    window.__realmUpdateShare = null;
    window.__realmUpdateShareMode = 'success';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          if (window.__realmUpdateClipboardMode === 'deny') throw new DOMException('denied', 'NotAllowedError');
          window.__realmUpdateClipboard = String(value);
        },
      },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareEnabled
        ? async payload => {
          if (window.__realmUpdateShareMode === 'cancel') throw new DOMException('cancelled', 'AbortError');
          window.__realmUpdateShare = structuredClone(payload);
        }
        : undefined,
    });
  }, { localeId: locale, serializedLedger: JSON.stringify(state), shareEnabled: share });
  return context;
}

async function setLedgerAndReload(page, state) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: LEDGER_KEY, value: state });
  await page.reload();
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('[data-action="open-realm-continuation"]');
  if (await primary.count()) {
    const box = await primary.boundingBox();
    expect(box?.width || 0, `${label} primary width`).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, `${label} primary height`).toBeGreaterThanOrEqual(44);
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function expectStage(page, locale, stage, energy) {
  const surface = page.locator('[data-beacon-district-growth]').first();
  await expect(surface).toHaveAttribute('data-stage', stage);
  await expect(surface).toHaveAttribute('data-energy', String(energy));
  await expect(surface.locator('.beacon-district-copy h2, .beacon-district-copy h3')).toHaveText(locale.stages[stage]);
  await expect(surface.locator('.beacon-district-energy bdi').first()).toHaveText(String(energy));
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} locked, intermediate, final, and recovery evidence`, async ({ browser }) => {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expectStage(page, locale, 'locked', 0);
      await expect(page.locator('[data-action="open-realm-continuation"]')).toHaveText(locale.nextAction);
      await expectQuality(page, `${locale.id} ${viewport.width} locked`);
      await page.screenshot({ path: `test-results/creator-realm-update/${locale.id}-${viewport.width}x${viewport.height}-locked.png`, fullPage: true });

      await setLedgerAndReload(page, ledger(3));
      await expectStage(page, locale, 'connected', 9);
      await expectQuality(page, `${locale.id} ${viewport.width} connected`);
      await page.screenshot({ path: `test-results/creator-realm-update/${locale.id}-${viewport.width}x${viewport.height}-connected.png`, fullPage: true });

      await setLedgerAndReload(page, ledger(6));
      await expectStage(page, locale, 'illuminated', 18);
      await expectQuality(page, `${locale.id} ${viewport.width} illuminated`);
      await page.screenshot({ path: `test-results/creator-realm-update/${locale.id}-${viewport.width}x${viewport.height}-illuminated.png`, fullPage: true });

      await setLedgerAndReload(page, ledger(0, { total: 72, unlocked: true }));
      await expect(page.locator('#realm-continuation-error-title')).toHaveText(locale.invalid);
      await expect(page.locator('[data-action="recover-realm-continuation"]')).toBeVisible();
      await expectQuality(page, `${locale.id} ${viewport.width} invalid recovery`);
      await page.screenshot({ path: `test-results/creator-realm-update/${locale.id}-${viewport.width}x${viewport.height}-recovery.png`, fullPage: true });
      await expect(page.locator('body')).not.toContainText(/realm_|receipt_|creatorverse-creator-ledger/iu);
      await context.close();
    });
  }
}

for (const locale of LOCALES) {
  test(`${locale.id} imports seven receipts exactly once through every district stage`, async ({ browser }) => {
    const context = await createContext(browser, { locale: locale.id, viewport: VIEWPORTS[1] });
    const page = await context.newPage();
    const expectedStages = ['outpost', 'outpost', 'connected', 'connected', 'connected', 'illuminated', 'illuminated'];

    for (let index = 1; index <= 7; index += 1) {
      await page.goto(`/#receipt=${receiptToken(index)}`);
      await expect(page.locator('[data-action="import-completion-receipt"]')).toBeVisible();
      await page.locator('[data-action="import-completion-receipt"]').click();
      await expectStage(page, locale, expectedStages[index - 1], index * 3);
      const announcement = page.locator('[data-completion-announcement]');
      await expect(announcement).not.toBeEmpty();
      if ([1, 3, 6].includes(index)) {
        await expect(page.locator('#creator-realm-update-title')).toBeFocused();
      }
      const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
      expect(stored.total).toBe(index * 3);
      expect(stored.receipts).toHaveLength(index);
    }

    await page.goto(`/#receipt=${receiptToken(1)}`);
    await expect(page.locator('[data-action="import-completion-receipt"]')).toHaveCount(0);
    await expectStage(page, locale, 'illuminated', 21);
    const beforeRefresh = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);
    await page.reload();
    await expectStage(page, locale, 'illuminated', 21);
    await expect(page.locator('[data-completion-announcement]')).toBeEmpty();
    await page.setViewportSize(VIEWPORTS[3]);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expectQuality(page, `${locale.id} restored zoomed progression`);
    expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(beforeRefresh);
    await context.close();
  });
}

test('copy recovery and cancellation never mutate the strict ledger', async ({ browser }) => {
  const context = await createContext(browser, { state: ledger(1), share: true });
  const page = await context.newPage();
  await page.goto(`/#receipt=${receiptToken(8)}`);
  await expectStage(page, LOCALES[0], 'outpost', 3);
  const before = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);

  await page.locator('[data-action="creator-realm-update-action"]').click();
  expect(await page.evaluate(() => window.__realmUpdateShare)).toMatchObject({ url: page.url().replace(/[#?].*$/u, '') });
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);

  await page.evaluate(() => { window.__realmUpdateShareMode = 'cancel'; });
  await page.locator('[data-action="creator-realm-update-action"]').click();
  await expect(page.locator('#creator-realm-update-status')).toHaveText('Share cancelled. Try again.');
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);
  await context.close();
});

test('storage failure preserves the last trustworthy locked stage and exposes retry', async ({ browser }) => {
  const context = await createContext(browser, { state: ledger(0) });
  const page = await context.newPage();
  await page.goto(`/#receipt=${receiptToken(9)}`);
  await expectStage(page, LOCALES[0], 'locked', 0);
  await page.evaluate(key => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(nextKey, value) {
      if (this === localStorage && nextKey === key) throw new DOMException('blocked', 'QuotaExceededError');
      return nativeSetItem.call(this, nextKey, value);
    };
  }, LEDGER_KEY);
  await page.locator('[data-action="import-completion-receipt"]').click();
  await expect(page.locator('[data-action="retry-completion-receipt"]')).toBeVisible();
  await expectStage(page, LOCALES[0], 'locked', 0);
  await expectQuality(page, 'storage failure');
  await context.close();
});
