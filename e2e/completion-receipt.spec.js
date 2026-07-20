import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCompletionReceipt } from '../src/completion-receipt.js';

mkdirSync('test-results/completion-receipt', { recursive: true });
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
  { id: 'en', dir: 'ltr', preview: 'Completion receipt', empty: 'No contributions yet', action: 'Add +3', success: '+3 added', duplicate: 'Already added', mismatch: 'Different realm', invalid: 'Receipt unavailable' },
  { id: 'ar', dir: 'rtl', preview: 'إيصال إنجاز', empty: 'لا مساهمات بعد', action: 'أضف +3', success: 'تمت إضافة +3', duplicate: 'تمت إضافته', mismatch: 'عالم مختلف', invalid: 'الإيصال غير متاح' },
];
const RECOVERY_EVIDENCE = [
  { viewport: VIEWPORTS[0], kind: 'invalid', state: 'invalid-extra-field' },
  { viewport: VIEWPORTS[1], kind: 'mismatch', state: 'mismatch' },
  { viewport: VIEWPORTS[2], kind: 'invalid', state: 'invalid-extra-field' },
  { viewport: VIEWPORTS[3], kind: 'mismatch', state: 'mismatch' },
  { viewport: VIEWPORTS[4], kind: 'invalid', state: 'invalid-extra-field' },
];

function receiptToken(overrides = {}) {
  return createCompletionReceipt({
    realmId: REALM_ID,
    receiptId: RECEIPT_ID,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    contribution: 3,
    districtId: 'beacon-district',
    ...overrides,
  });
}

function ledgerEntry(index) {
  return {
    id: `receipt_${String(index).padStart(16, '0')}`,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    districtId: 'beacon-district',
    contribution: 3,
  };
}

function realmState(receipts = []) {
  return {
    version: 1,
    realms: [{
      id: REALM_ID,
      name: 'Nova Guild',
      theme: 'cosmic',
      total: receipts.length * 3,
      districtId: 'beacon-district',
      unlocked: receipts.length > 0,
      receipts,
    }],
  };
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  ledger = realmState(),
  failLedgerWrites = false,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeId, serializedLedger, failWrites }) => {
    if (!localStorage.getItem('creatorverse-locale')) localStorage.setItem('creatorverse-locale', localeId);
    if (!localStorage.getItem('creatorverse-creator-ledger-v1')) {
      localStorage.setItem('creatorverse-creator-ledger-v1', serializedLedger);
    }
    window.__completionClipboard = '';
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__completionClipboard = String(value); } },
    });
    if (failWrites) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (this === localStorage && key === 'creatorverse-creator-ledger-v1' && window.__failCompletionLedgerWrite !== false) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    }
  }, { localeId: locale, serializedLedger: JSON.stringify(ledger), failWrites: failLedgerWrites });
  return context;
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
  const action = page.locator('.completion-import-action:visible:not([disabled])');
  if (await action.count()) {
    const box = await action.boundingBox();
    expect(box?.width || 0, `${label} action width`).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, `${label} action height`).toBeGreaterThanOrEqual(44);
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function capture(page, locale, viewport, state) {
  await page.screenshot({
    path: `test-results/completion-receipt/${locale.id}-${viewport.width}x${viewport.height}-${state}.png`,
    fullPage: true,
  });
}

async function buildInvite(page) {
  await page.goto('/');
  await page.locator('[data-action="creator"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('input[name="mission-template"][value="route-choice"]').check();
  await page.locator('[data-action="creator-next"]').click();
  await expect(page.locator('[data-prototype-invite-receipt]')).toBeVisible();
  await page.locator('[data-action="copy-prototype-invite"]').click();
  const invite = await page.evaluate(() => window.__completionClipboard);
  expect(invite).toContain('#invite=v1.');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY);
  expect(stored.realms).toHaveLength(1);
  expect(stored.realms[0]).toMatchObject({ total: 0, receipts: [], unlocked: false });
  return invite;
}

async function completeMission(page, invite) {
  await page.goto(invite);
  await page.locator('[data-role="builder"]').click();
  await page.locator('[data-mission-command="sky"]').click();
  await expect(page.locator('[data-mission-result]')).toBeVisible();
  await page.locator('[data-action="mission-result-action"]').click();
  const shared = await page.evaluate(() => window.__completionClipboard);
  const match = shared.match(/https?:\/\/\S+#receipt=cr1\.[A-Za-z0-9_-]+/u);
  expect(match, shared).not.toBeNull();
  expect(shared).not.toMatch(/[?&](?:creator|follower|handle|contact|timestamp)=/iu);
  return match[0];
}

test('creator → follower → creator imports one anonymous +3 exactly once across refresh and language switch', async ({ browser }) => {
  const creatorContext = await createContext(browser, { ledger: { version: 1, realms: [] } });
  const creator = await creatorContext.newPage();
  const invite = await buildInvite(creator);

  const followerContext = await createContext(browser, { ledger: { version: 1, realms: [] } });
  const follower = await followerContext.newPage();
  const receiptUrl = await completeMission(follower, invite);
  await followerContext.close();

  await creator.goto(receiptUrl);
  await expect(creator).not.toHaveURL(/#receipt=/u);
  await expect(creator.locator('#completion-receipt-title')).toHaveText('Completion receipt');
  await expect(creator.locator('#completion-receipt-title')).toBeFocused();
  await expect(creator.locator('[data-ledger-empty]')).toContainText('No contributions yet');
  await creator.locator('[data-action="import-completion-receipt"]').focus();
  await creator.keyboard.press('Enter');
  await expect(creator.locator('#completion-receipt-title')).toHaveText('+3 added');
  await expect(creator.locator('#creator-realm-update-title')).toBeFocused();
  await expect(creator.locator('[data-ledger-list] li')).toHaveCount(1);
  await expect(creator.locator('.completion-total strong')).toHaveText('3');

  await creator.reload();
  await expect(creator.locator('#completion-receipt-title')).toHaveText('Already added');
  await expect(creator.locator('[data-ledger-list] li')).toHaveCount(1);
  await expect(creator.locator('.completion-total strong')).toHaveText('3');

  await Promise.all([
    creator.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    creator.locator('[data-locale="ar"]').click(),
  ]);
  await expect(creator.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(creator.locator('#completion-receipt-title')).toHaveText('تمت إضافته');
  await expect(creator.locator('[data-ledger-list] li')).toHaveCount(1);
  const finalState = await creator.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY);
  expect(finalState.realms[0]).toMatchObject({ total: 3, receipts: [expect.any(Object)] });
  await creatorContext.close();
});

test('same-tab receipt hash navigation activates preview without a document reload', async ({ browser }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => { window.__sameDocumentReceiptMarker = 'preserved'; });
  await page.evaluate(token => { window.location.hash = `receipt=${token}`; }, receiptToken());
  await expect(page).not.toHaveURL(/#receipt=/u);
  await expect(page.locator('#completion-receipt-title')).toHaveText('Completion receipt');
  await expect(page.locator('#completion-receipt-title')).toBeFocused();
  await expect(page.locator('[data-action="import-completion-receipt"]')).toBeVisible();
  expect(await page.evaluate(() => window.__sameDocumentReceiptMarker)).toBe('preserved');
  await page.locator('[data-action="import-completion-receipt"]').click();
  await expect(page.locator('[data-ledger-list] li')).toHaveCount(1);
  await context.close();
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} receipt preview and success remain responsive`, async ({ browser }) => {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto(`/#receipt=${receiptToken()}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.id);
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('#completion-receipt-title')).toHaveText(locale.preview);
      await expect(page.locator('#completion-receipt-title')).toBeFocused();
      await expect(page.locator('[data-ledger-empty]')).toContainText(locale.empty);
      await expect(page.locator('[data-action="import-completion-receipt"]')).toContainText(locale.action);
      await expectQuality(page, `${locale.id} ${viewport.width} preview`);
      await capture(page, locale, viewport, 'preview-empty');

      await page.locator('[data-action="import-completion-receipt"]').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#completion-receipt-title')).toHaveText(locale.success);
      await expect(page.locator('#creator-realm-update-title')).toBeFocused();
      await expect(page.locator('[data-ledger-list] li')).toHaveCount(1);
      await expectQuality(page, `${locale.id} ${viewport.width} success`);
      await capture(page, locale, viewport, 'success-ledger');
      await context.close();
    });
  }
}

for (const locale of LOCALES) {
  for (const evidence of RECOVERY_EVIDENCE) {
    test(`${locale.id} ${evidence.viewport.width} ${evidence.kind} receipt recovery remains safe and responsive`, async ({ browser }) => {
      const ledger = evidence.kind === 'mismatch' ? { version: 1, realms: [] } : realmState();
      const context = await createContext(browser, { locale: locale.id, viewport: evidence.viewport, ledger });
      const page = await context.newPage();
      const before = JSON.stringify(ledger);

      if (evidence.kind === 'mismatch') {
        await page.goto(`/#receipt=${receiptToken()}`);
        await expect(page.locator('#completion-receipt-title')).toHaveText(locale.mismatch);
      } else {
        await page.goto(`/#receipt=${receiptToken()}&creator=hidden`);
        await expect(page.locator('#completion-receipt-title')).toHaveText(locale.invalid);
        await expect(page.locator('body')).not.toContainText('hidden');
        await expect(page).not.toHaveURL(/(?:receipt|creator)=/u);
      }

      await expect(page.locator('[data-action="import-completion-receipt"]')).toHaveCount(0);
      expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(before);
      await expectQuality(page, `${locale.id} ${evidence.viewport.width} ${evidence.kind}`);
      await capture(page, locale, evidence.viewport, evidence.state);
      await context.close();
    });
  }

  test(`${locale.id} malformed receipt fails closed without reflection`, async ({ browser }) => {
    const ledger = realmState();
    const context = await createContext(browser, { locale: locale.id, viewport: VIEWPORTS[0], ledger });
    const page = await context.newPage();
    await page.goto('/#receipt=cr1.%3Cscript%3Ealert(1)%3C/script%3E');
    await expect(page.locator('#completion-receipt-title')).toHaveText(locale.invalid);
    await expect(page.locator('body')).not.toContainText('<script>alert(1)</script>');
    await expect(page).not.toHaveURL(/#receipt=/u);
    await expect(page.locator('[data-action="import-completion-receipt"]')).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(JSON.stringify(ledger));
    await expectQuality(page, `${locale.id} malformed`);
    await context.close();
  });
}

test('storage failure stays atomic and exposes one recoverable retry', async ({ browser }) => {
  const context = await createContext(browser, { failLedgerWrites: true });
  const page = await context.newPage();
  await page.goto(`/#receipt=${receiptToken()}`);
  await page.locator('[data-action="import-completion-receipt"]').click();
  await expect(page.locator('#completion-receipt-title')).toHaveText('Save failed');
  await expect(page.locator('[data-action="retry-completion-receipt"]')).toBeVisible();
  await expect(page.locator('.completion-total strong')).toHaveText('0');
  await expect(page.locator('[data-ledger-empty]')).toBeVisible();
  await page.evaluate(() => { window.__failCompletionLedgerWrite = false; });
  await page.locator('[data-action="retry-completion-receipt"]').click();
  await expect(page.locator('#completion-receipt-title')).toHaveText('+3 added');
  await expect(page.locator('[data-ledger-list] li')).toHaveCount(1);
  await expect(page.locator('.completion-total strong')).toHaveText('3');
  await context.close();
});

test('full local ledger rejects a twenty-fifth receipt without mutation', async ({ browser }) => {
  const receipts = Array.from({ length: 24 }, (_, index) => ledgerEntry(index));
  const context = await createContext(browser, { ledger: realmState(receipts) });
  const page = await context.newPage();
  await page.goto(`/#receipt=${receiptToken({ receiptId: 'receipt_overflow000000' })}`);
  await expect(page.locator('#completion-receipt-title')).toHaveText('Ledger full');
  await expect(page.locator('[data-action="import-completion-receipt"]')).toHaveCount(0);
  await expect(page.locator('[data-ledger-list] li')).toHaveCount(24);
  await expect(page.locator('.completion-total strong')).toHaveText('72');
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY);
  expect(state.realms[0]).toMatchObject({ total: 72 });
  expect(state.realms[0].receipts).toHaveLength(24);
  await context.close();
});

test('200% text zoom and resize preserve one imported receipt without overflow', async ({ browser }) => {
  const context = await createContext(browser, { viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto(`/#receipt=${receiptToken()}`);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expectQuality(page, '200% preview');
  await page.locator('[data-action="import-completion-receipt"]').click();
  await expect(page.locator('[data-ledger-list] li')).toHaveCount(1);
  await page.setViewportSize(VIEWPORTS[3]);
  await expect(page.locator('[data-ledger-list] li')).toHaveCount(1);
  await expect(page.locator('.completion-total strong')).toHaveText('3');
  await expectQuality(page, '200% resized success');
  await context.close();
});
