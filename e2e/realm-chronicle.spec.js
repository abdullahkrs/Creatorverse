import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCompletionReceipt } from '../src/completion-receipt.js';

mkdirSync('test-results/realm-chronicle', { recursive: true });
test.setTimeout(180_000);

const REALM_ID = 'realm_abcdefghijklmnop';
const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const LOCALE_KEY = 'creatorverse-locale';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', title: 'Realm chronicle', empty: 'No accepted contributions yet.', showAll: 'Show all', showRecent: 'Show recent', launch: 'Launch next mission' },
  { id: 'ar', dir: 'rtl', title: 'سجل العالم', empty: 'لا توجد مساهمات مقبولة بعد.', showAll: 'عرض الكل', showRecent: 'عرض الأحدث', launch: 'أطلق المهمة التالية' },
];
const MISSIONS = ['route-choice', 'relay-sequence', 'signal-match'];
const ROLES = ['builder', 'explorer', 'guardian'];
const ROUTES = ['sky', 'ocean'];

function entry(index) {
  return {
    id: `receipt_${String(index).padStart(16, '0')}`,
    missionId: MISSIONS[index % MISSIONS.length],
    roleId: ROLES[index % ROLES.length],
    routeId: ROUTES[index % ROUTES.length],
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
    missionId: MISSIONS[index % MISSIONS.length],
    roleId: ROLES[index % ROLES.length],
    routeId: ROUTES[index % ROUTES.length],
    districtId: 'beacon-district',
    contribution: 3,
  });
}

async function createContext(browser, { locale = 'en', viewport = VIEWPORTS[1], state = ledger(0) } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeKey, localeId, ledgerKey, serializedLedger }) => {
    if (localStorage.getItem(localeKey) === null) localStorage.setItem(localeKey, localeId);
    if (localStorage.getItem(ledgerKey) === null) localStorage.setItem(ledgerKey, serializedLedger);
  }, {
    localeKey: LOCALE_KEY,
    localeId: locale,
    ledgerKey: LEDGER_KEY,
    serializedLedger: JSON.stringify(state),
  });
  return context;
}

async function replaceLedger(page, state) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: LEDGER_KEY, value: state });
  await page.reload();
}

async function expectQuality(page, label) {
  await expect(page.locator('[data-action="open-realm-continuation"]:visible, [data-action="recover-realm-continuation"]:visible').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
  for (const selector of ['[data-action="open-realm-continuation"]:visible', '[data-action="toggle-realm-chronicle"]:visible', '[data-action="recover-realm-continuation"]:visible']) {
    const action = page.locator(selector).first();
    if (await action.count()) {
      const box = await action.boundingBox();
      expect(box?.width || 0, `${label} ${selector} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height || 0, `${label} ${selector} height`).toBeGreaterThanOrEqual(44);
    }
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function expectPrimaryFirst(page, locale) {
  const launch = page.locator('[data-action="open-realm-continuation"]');
  await expect(launch).toHaveText(locale.launch);
  const relation = await page.evaluate(() => {
    const operation = document.querySelector('[data-realm-continuation][data-state="ready"] > .realm-continuation-operation');
    const context = document.querySelector('[data-realm-continuation][data-state="ready"] > .realm-continuation-context');
    return Boolean(operation && context && (operation.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(relation).toBe(true);
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} empty, seven, expanded, and recovery evidence`, async ({ browser }) => {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expectPrimaryFirst(page, locale);
      await expect(page.locator('#realm-chronicle-title')).toHaveText(locale.title);
      await expect(page.locator('.realm-chronicle-empty')).toHaveText(locale.empty);
      await expect(page.locator('[data-chronicle-list]')).toHaveCount(0);
      await expectQuality(page, `${locale.id} ${viewport.width} empty`);
      await page.screenshot({ path: `test-results/realm-chronicle/${locale.id}-${viewport.width}x${viewport.height}-empty.png`, fullPage: true });

      await replaceLedger(page, ledger(7));
      await expectPrimaryFirst(page, locale);
      await expect(page.locator('.realm-chronicle-entry')).toHaveCount(7);
      await expect(page.locator('.realm-chronicle-summary')).toContainText('21');
      await expect(page.locator('[data-action="toggle-realm-chronicle"]')).toHaveCount(0);
      await expect(page.locator('.realm-chronicle-entry-total bdi').first()).toHaveText('21');
      await expect(page.locator('.realm-chronicle-entry-total bdi').last()).toHaveText('3');
      await expectQuality(page, `${locale.id} ${viewport.width} seven`);
      await page.screenshot({ path: `test-results/realm-chronicle/${locale.id}-${viewport.width}x${viewport.height}-seven.png`, fullPage: true });

      await replaceLedger(page, ledger(24));
      const toggle = page.locator('[data-action="toggle-realm-chronicle"]');
      await expect(page.locator('.realm-chronicle-entry')).toHaveCount(7);
      await expect(toggle).toHaveText(locale.showAll);
      await toggle.focus();
      await toggle.click();
      await expect(page.locator('.realm-chronicle-entry')).toHaveCount(24);
      await expect(toggle).toHaveText(locale.showRecent);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toBeFocused();
      await expect(page.locator('[data-realm-chronicle-live]')).not.toBeEmpty();
      await expectQuality(page, `${locale.id} ${viewport.width} expanded`);
      await page.screenshot({ path: `test-results/realm-chronicle/${locale.id}-${viewport.width}x${viewport.height}-expanded.png`, fullPage: true });
      await toggle.click();
      await expect(page.locator('.realm-chronicle-entry')).toHaveCount(7);
      await expect(toggle).toBeFocused();

      await replaceLedger(page, ledger(1, { total: 6 }));
      await expect(page.locator('[data-realm-chronicle]')).toHaveCount(0);
      await expect(page.locator('[data-action="recover-realm-continuation"]')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/realm_|receipt_|creatorverse-creator-ledger/iu);
      await expectQuality(page, `${locale.id} ${viewport.width} recovery`);
      await page.screenshot({ path: `test-results/realm-chronicle/${locale.id}-${viewport.width}x${viewport.height}-recovery.png`, fullPage: true });
      await context.close();
    });
  }
}

for (const locale of LOCALES) {
  test(`${locale.id} seven receipt imports remain exact through launch, reload, and locale change`, async ({ browser }) => {
    const context = await createContext(browser, { locale: locale.id, viewport: VIEWPORTS[1] });
    const page = await context.newPage();

    for (let index = 1; index <= 7; index += 1) {
      await page.goto(`/#receipt=${receiptToken(index)}`);
      await page.locator('[data-action="import-completion-receipt"]').click();
      await expect(page.locator('.completion-total bdi')).toHaveText(String(index * 3));
      await page.locator('[data-action="leave-completion-receipt"]').click();
      await expect(page.locator('[data-realm-continuation][data-state="ready"]')).toBeVisible();
    }

    await expect(page.locator('.realm-chronicle-entry')).toHaveCount(7);
    await expect(page.locator('.realm-chronicle-entry-total bdi').first()).toHaveText('21');
    const before = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);
    await page.locator('[data-action="open-realm-continuation"]').click();
    expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);
    await page.locator('[data-action="cancel-realm-continuation"]').click();
    await page.reload();
    await expect(page.locator('.realm-chronicle-entry')).toHaveCount(7);
    expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);

    const otherLocale = locale.id === 'en' ? 'ar' : 'en';
    await page.evaluate(value => localStorage.setItem('creatorverse-locale', value), otherLocale);
    await page.reload();
    await expect(page.locator('.realm-chronicle-entry')).toHaveCount(7);
    await expect(page.locator('.realm-chronicle-entry-total bdi').first()).toHaveText('21');
    expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);
    await context.close();
  });
}

test('duplicate receipt and history disclosure never mutate the strict ledger', async ({ browser }) => {
  const context = await createContext(browser, { locale: 'en', state: ledger(24) });
  const page = await context.newPage();
  await page.goto('/');
  const before = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);
  await page.locator('[data-action="toggle-realm-chronicle"]').click();
  await page.locator('[data-action="toggle-realm-chronicle"]').click();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);

  const duplicate = createCompletionReceipt({
    realmId: REALM_ID,
    receiptId: entry(0).id,
    missionId: entry(0).missionId,
    roleId: entry(0).roleId,
    routeId: entry(0).routeId,
    districtId: 'beacon-district',
    contribution: 3,
  });
  await page.goto(`/#receipt=${duplicate}`);
  await expect(page.locator('[data-action="import-completion-receipt"]')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);
  await context.close();
});
