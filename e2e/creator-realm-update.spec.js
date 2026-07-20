import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCompletionReceipt } from '../src/completion-receipt.js';

mkdirSync('test-results/creator-realm-update', { recursive: true });
test.setTimeout(120_000);

const REALM_ID = 'realm_abcdefghijklmnop';
const RECEIPT_ID = 'receipt_abcdefghijklmn';
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
    title: 'Realm signal updated',
    waiting: 'Realm signal waiting',
    action: 'Copy update',
    failed: 'Couldn’t share. Copy the update manually.',
    location: 'Starforge Realm · Beacon District',
  },
  {
    id: 'ar',
    dir: 'rtl',
    title: 'تم تحديث إشارة العالم',
    waiting: 'إشارة العالم بانتظار مساهمة',
    action: 'انسخ التحديث',
    failed: 'تعذّرت المشاركة. انسخ التحديث يدويًا.',
    location: 'عالم الحدادة النجمية · حيّ المنارة',
  },
];

function receiptToken() {
  return createCompletionReceipt({
    realmId: REALM_ID,
    receiptId: RECEIPT_ID,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    contribution: 3,
    districtId: 'beacon-district',
  });
}

function emptyRealmLedger() {
  return {
    version: 1,
    realms: [{
      id: REALM_ID,
      name: 'Private creator name',
      theme: 'cosmic',
      total: 0,
      districtId: 'beacon-district',
      unlocked: false,
      receipts: [],
    }],
  };
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  ledger = emptyRealmLedger(),
  share = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeId, serializedLedger, shareEnabled }) => {
    if (!localStorage.getItem('creatorverse-locale')) localStorage.setItem('creatorverse-locale', localeId);
    if (!localStorage.getItem('creatorverse-creator-ledger-v1')) {
      localStorage.setItem('creatorverse-creator-ledger-v1', serializedLedger);
    }
    window.__realmUpdateClipboard = '';
    window.__realmUpdateClipboardMode = 'success';
    window.__realmUpdateShare = null;
    window.__realmUpdateShareMode = 'success';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          if (window.__realmUpdateClipboardMode === 'deny') {
            throw new DOMException('denied', 'NotAllowedError');
          }
          window.__realmUpdateClipboard = String(value);
        },
      },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareEnabled
        ? async payload => {
          if (window.__realmUpdateShareMode === 'cancel') {
            throw new DOMException('cancelled', 'AbortError');
          }
          window.__realmUpdateShare = structuredClone(payload);
        }
        : undefined,
    });
  }, { localeId: locale, serializedLedger: JSON.stringify(ledger), shareEnabled: share });
  return context;
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
  const action = page.locator('[data-action="creator-realm-update-action"]');
  if (await action.count()) {
    const box = await action.boundingBox();
    expect(box?.width || 0, `${label} action width`).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, `${label} action height`).toBeGreaterThanOrEqual(44);
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function importFirstReceipt(page) {
  await page.goto(`/#receipt=${receiptToken()}`);
  await expect(page.locator('[data-creator-realm-update]')).toHaveAttribute('data-update-state', 'empty');
  await page.locator('[data-action="import-completion-receipt"]').click();
  await expect(page.locator('[data-creator-realm-update]')).toHaveAttribute('data-update-state', 'idle');
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} realm update ready and manual recovery evidence`, async ({ browser }) => {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(`/#receipt=${receiptToken()}`);
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('#creator-realm-update-title')).toHaveText(locale.waiting);
      await expect(page.locator('[data-action="creator-realm-update-action"]')).toHaveCount(0);

      await page.locator('[data-action="import-completion-receipt"]').click();
      await expect(page.locator('#creator-realm-update-title')).toHaveText(locale.title);
      await expect(page.locator('#creator-realm-update-title')).toBeFocused();
      await expect(page.locator('.creator-realm-location')).toHaveText(locale.location);
      await expect(page.locator('.creator-realm-update-facts dd').nth(0)).toHaveText('1');
      await expect(page.locator('.creator-realm-update-facts dd').nth(1)).toHaveText('3');
      await expect(page.locator('[data-action="creator-realm-update-action"]')).toHaveText(locale.action);
      await expect(page.locator('[data-action="creator-realm-update-action"]')).toHaveCount(1);
      await expectQuality(page, `${locale.id} ${viewport.width} ready`);
      await page.screenshot({
        path: `test-results/creator-realm-update/${locale.id}-${viewport.width}x${viewport.height}-ready.png`,
        fullPage: true,
      });

      await page.evaluate(() => { window.__realmUpdateClipboardMode = 'deny'; });
      await page.locator('[data-action="creator-realm-update-action"]').click();
      await expect(page.locator('#creator-realm-update-status')).toHaveText(locale.failed);
      await expect(page.locator('.creator-realm-manual-copy textarea')).toBeVisible();
      await expect(page.locator('[data-action="creator-realm-update-action"]')).toBeFocused();
      const manual = await page.locator('.creator-realm-manual-copy textarea').inputValue();
      expect(manual).toContain(page.url().replace(/[#?].*$/u, ''));
      expect(manual).not.toMatch(/Private creator name|realm_abcdefghijklmnop|receipt_|route-choice|builder|sky|[?#]/iu);
      await expectQuality(page, `${locale.id} ${viewport.width} recovery`);
      await page.screenshot({
        path: `test-results/creator-realm-update/${locale.id}-${viewport.width}x${viewport.height}-manual-recovery.png`,
        fullPage: true,
      });

      await page.evaluate(() => { window.__realmUpdateClipboardMode = 'success'; });
      await page.locator('[data-action="creator-realm-update-action"]').click();
      const copied = await page.evaluate(() => window.__realmUpdateClipboard);
      expect(copied).not.toMatch(/Private creator name|realm_abcdefghijklmnop|receipt_|route-choice|builder|sky|[?#]/iu);
      expect(copied).toMatch(/https?:\/\//u);
      const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY);
      expect(stored.realms[0].receipts).toHaveLength(1);
      expect(stored.realms[0].total).toBe(3);
      await context.close();
    });
  }
}

test('Web Share succeeds once, cancellation stays neutral, and neither path mutates the ledger', async ({ browser }) => {
  const context = await createContext(browser, { share: true });
  const page = await context.newPage();
  await importFirstReceipt(page);
  const before = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);

  await page.locator('[data-action="creator-realm-update-action"]').click();
  const shared = await page.evaluate(() => window.__realmUpdateShare);
  expect(shared).toMatchObject({ title: 'Creatorverse realm update', url: page.url().replace(/[#?].*$/u, '') });
  expect(shared.text).not.toMatch(/Private creator name|realm_abcdefghijklmnop|receipt_|verified|authentic/iu);
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);

  await page.evaluate(() => { window.__realmUpdateShareMode = 'cancel'; });
  await page.locator('[data-action="creator-realm-update-action"]').click();
  await expect(page.locator('#creator-realm-update-status')).toHaveText('Share cancelled. Try again.');
  await expect(page.locator('[data-action="creator-realm-update-action"]')).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);
  await context.close();
});

test('refresh, locale switch, resize, 200% text zoom, and reduced motion preserve one derived update without replay', async ({ browser }) => {
  const context = await createContext(browser, { viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await importFirstReceipt(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.setViewportSize(VIEWPORTS[3]);
  await expect(page.locator('#creator-realm-update-title')).toHaveText('Realm signal updated');
  await expectQuality(page, 'zoomed resized realm update');

  await page.reload();
  await expect(page.locator('#creator-realm-update-title')).toHaveText('Realm signal updated');
  await expect(page.locator('[data-completion-announcement]')).toBeEmpty();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('[data-locale="ar"]').click(),
  ]);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#creator-realm-update-title')).toHaveText('تم تحديث إشارة العالم');
  await expect(page.locator('.creator-realm-update-facts dd').nth(0)).toHaveText('1');
  await expect(page.locator('.creator-realm-update-facts dd').nth(1)).toHaveText('3');
  await expect(page.locator('[data-completion-announcement]')).toBeEmpty();
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY);
  expect(stored.realms[0].receipts).toHaveLength(1);
  await context.close();
});

test('malformed and fresh cross-realm contexts reveal no creator update or share payload', async ({ browser }) => {
  const malformed = {
    version: 1,
    realms: [{ ...emptyRealmLedger().realms[0], total: 72, receipts: [], unlocked: true }],
  };
  const context = await createContext(browser, { ledger: malformed });
  const page = await context.newPage();
  await page.goto(`/#receipt=${receiptToken()}`);
  await expect(page.locator('[data-creator-realm-update]')).toHaveCount(0);
  await expect(page.locator('[data-action="creator-realm-update-action"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Private creator name');
  await context.close();

  const fresh = await createContext(browser, { ledger: { version: 1, realms: [] } });
  const freshPage = await fresh.newPage();
  await freshPage.goto(`/#receipt=${receiptToken()}`);
  await expect(freshPage.locator('[data-creator-realm-update]')).toHaveCount(0);
  await expect(freshPage.locator('[data-action="creator-realm-update-action"]')).toHaveCount(0);
  await fresh.close();
});
