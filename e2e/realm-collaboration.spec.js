import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRealmCollaborationProposal } from '../src/realm-collaboration.js';

mkdirSync('test-results/realm-collaboration', { recursive: true });
test.setTimeout(180_000);

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const COLLAB_KEY = 'creatorverse-realm-collaboration-v1';
const LOCALE_KEY = 'creatorverse-locale';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', collaborate: 'Collaborate', preview: 'Review realm link', linked: 'Collaboration linked', invalid: 'Proposal unavailable' },
  { id: 'ar', dir: 'rtl', collaborate: 'تعاون', preview: 'راجع رابط العالم', linked: 'التعاون مرتبط', invalid: 'المقترح غير متاح' },
];
const SOURCE = { id: 'realm_source_00000001', name: 'Signal Atlas', theme: 'cosmic' };
const LOCAL = { id: 'realm_local_000000002', name: 'Canopy Relay', theme: 'wild' };

function ledger(realm) {
  return {
    version: 1,
    realms: [{
      ...realm,
      total: 0,
      districtId: 'beacon-district',
      unlocked: false,
      receipts: [],
    }],
  };
}

async function createContext(browser, { realm, locale, viewport }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeKey, localeId, ledgerKey, serializedLedger }) => {
    if (localStorage.getItem(localeKey) === null) localStorage.setItem(localeKey, localeId);
    if (localStorage.getItem(ledgerKey) === null) localStorage.setItem(ledgerKey, serializedLedger);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => { sessionStorage.setItem('__creatorverse_test_clipboard', value); },
      },
    });
  }, {
    localeKey: LOCALE_KEY,
    localeId: locale,
    ledgerKey: LEDGER_KEY,
    serializedLedger: JSON.stringify(ledger(realm)),
  });
  return context;
}

async function expectQuality(page, label) {
  await expect(page.locator('[data-action="open-realm-continuation"]')).toBeVisible();
  await expect(page.locator('[data-action="open-realm-collaboration"]')).toBeVisible();
  const order = await page.evaluate(() => {
    const launch = document.querySelector('[data-action="open-realm-continuation"]');
    const collaborate = document.querySelector('[data-action="open-realm-collaboration"]');
    return launch && collaborate
      ? Boolean(launch.compareDocumentPosition(collaborate) & Node.DOCUMENT_POSITION_FOLLOWING)
      : false;
  });
  expect(order, `${label} mission launch remains first`).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
  for (const action of await page.locator('[data-realm-collaboration] button:visible, [data-action="open-realm-collaboration"]:visible').all()) {
    const box = await action.boundingBox();
    expect(box?.width || 0, `${label} target width`).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, `${label} target height`).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('body')).not.toContainText(/realm_(source|local)|proposal_[A-Za-z0-9_-]+|creatorverse-realm-collaboration/iu);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function createProposalThroughUi(page, locale) {
  const ledgerBefore = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);
  await expect(page.locator('[data-action="open-realm-collaboration"]')).toHaveText(locale.collaborate);
  await page.locator('[data-action="open-realm-collaboration"]').click();
  await expect(page.locator('#realm-collaboration-title')).toBeFocused();
  await page.locator('[data-action="create-realm-collaboration"]').click();
  await expect(page.locator('[data-realm-collaboration][data-state="proposal-ready"]')).toBeVisible();
  await expect(page.locator('[data-realm-collaboration][data-state="proposal-ready"] .realm-collaboration-realm')).toHaveCount(1);
  await page.locator('[data-action="resume-realm-collaboration"]').click();
  await expect(page.locator('[data-collaboration-live], [data-handshake-live]')).not.toBeEmpty();
  const copied = await page.evaluate(() => sessionStorage.getItem('__creatorverse_test_clipboard'));
  expect(copied).toContain('#collab=');
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
  return copied;
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} proposal, preview, linked, invalid, and removal evidence`, async ({ browser }) => {
      const sourceContext = await createContext(browser, { realm: SOURCE, locale: locale.id, viewport });
      const sourcePage = await sourceContext.newPage();
      await sourcePage.goto('/');
      await expect(sourcePage.locator('html')).toHaveAttribute('dir', locale.dir);
      const proposalUrl = await createProposalThroughUi(sourcePage, locale);
      await expectQuality(sourcePage, `${locale.id} ${viewport.width} proposal`);
      await sourcePage.screenshot({ path: `test-results/realm-collaboration/${locale.id}-${viewport.width}x${viewport.height}-proposal-ready.png`, fullPage: true });

      const recipientContext = await createContext(browser, { realm: LOCAL, locale: locale.id, viewport });
      const recipientPage = await recipientContext.newPage();
      const ledgerBefore = JSON.stringify(ledger(LOCAL));
      await recipientPage.goto(proposalUrl);
      await expect(recipientPage).toHaveURL(/\/$/u);
      await expect(recipientPage.locator('#realm-collaboration-preview-title')).toHaveText(locale.preview);
      await expect(recipientPage.locator('#realm-collaboration-preview-title')).toBeFocused();
      await expect(recipientPage.locator('.realm-collaboration-realm strong')).toHaveText([SOURCE.name, LOCAL.name]);
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
      await expectQuality(recipientPage, `${locale.id} ${viewport.width} preview`);
      await recipientPage.screenshot({ path: `test-results/realm-collaboration/${locale.id}-${viewport.width}x${viewport.height}-recipient-preview.png`, fullPage: true });

      await recipientPage.locator('[data-action="accept-realm-collaboration"]').click();
      await expect(recipientPage.locator('#realm-collaboration-linked-title')).toHaveText(locale.linked);
      await expect(recipientPage.locator('#realm-collaboration-linked-title')).toBeFocused();
      const linkedRecord = await recipientPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY);
      expect(linkedRecord).not.toBeNull();
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
      await recipientPage.reload();
      await recipientPage.locator('[data-action="open-realm-collaboration"]').click();
      await expect(recipientPage.locator('#realm-collaboration-linked-title')).toHaveText(locale.linked);
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(linkedRecord);
      await expectQuality(recipientPage, `${locale.id} ${viewport.width} linked`);
      await recipientPage.screenshot({ path: `test-results/realm-collaboration/${locale.id}-${viewport.width}x${viewport.height}-linked-success.png`, fullPage: true });

      await recipientPage.goto('/#collab=malformed');
      await expect(recipientPage).toHaveURL(/\/$/u);
      await expect(recipientPage.locator('#realm-collaboration-error-title')).toHaveText(locale.invalid);
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(linkedRecord);
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
      await expectQuality(recipientPage, `${locale.id} ${viewport.width} invalid`);
      await recipientPage.screenshot({ path: `test-results/realm-collaboration/${locale.id}-${viewport.width}x${viewport.height}-invalid-recovery.png`, fullPage: true });
      await recipientPage.locator('[data-action="reject-realm-collaboration"]').click();
      await recipientPage.locator('[data-action="open-realm-collaboration"]').click();

      await recipientPage.locator('[data-action="remove-realm-collaboration"]').click();
      await expect(recipientPage.locator('[role="dialog"]')).toBeVisible();
      await expect(recipientPage.locator('[data-action="keep-realm-collaboration"]')).toBeFocused();
      await expectQuality(recipientPage, `${locale.id} ${viewport.width} removal`);
      await recipientPage.screenshot({ path: `test-results/realm-collaboration/${locale.id}-${viewport.width}x${viewport.height}-removal-confirmation.png`, fullPage: true });
      await recipientPage.keyboard.press('Escape');
      await expect(recipientPage.locator('[role="dialog"]')).toHaveCount(0);
      await expect(recipientPage.locator('[data-action="remove-realm-collaboration"]')).toBeFocused();
      await recipientPage.locator('[data-action="remove-realm-collaboration"]').click();
      await recipientPage.locator('[data-action="confirm-remove-realm-collaboration"]').click();
      await expect(recipientPage.locator('[data-action="open-realm-collaboration"]')).toBeFocused();
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);

      await sourceContext.close();
      await recipientContext.close();
    });
  }
}

test('duplicate, self-link, second-link, query transport, and locale reload fail closed', async ({ browser, baseURL }) => {
  const sourceProposal = createRealmCollaborationProposal(SOURCE, {
    cryptoLike: { randomUUID: () => '12345678-1234-4234-9234-123456789abc' },
    baseUrl: `${baseURL}/`,
  });
  const otherProposal = createRealmCollaborationProposal({ id: 'realm_other_000000002', name: 'Circuit Haven', theme: 'future' }, {
    cryptoLike: { randomUUID: () => 'abcdefab-cdef-4abc-9def-abcdefabcdef' },
    baseUrl: `${baseURL}/`,
  });

  const context = await createContext(browser, { realm: LOCAL, locale: 'en', viewport: VIEWPORTS[1] });
  const page = await context.newPage();
  await page.goto(sourceProposal.url);
  await page.locator('[data-action="accept-realm-collaboration"]').click();
  const firstRecord = await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY);
  await page.goto(sourceProposal.url);
  await expect(page.locator('[data-collaboration-live]')).toContainText('already linked');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(firstRecord);

  await page.goto(otherProposal.url);
  await expect(page.locator('#realm-collaboration-error-title')).toHaveText('One link already exists');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(firstRecord);
  await page.locator('[data-action="view-current-realm-collaboration"]').click();
  await expect(page.locator('#realm-collaboration-linked-title')).toBeVisible();

  await page.goto(`/?collab=${encodeURIComponent(sourceProposal.token)}`);
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator('#realm-collaboration-error-title')).toHaveText('Proposal unavailable');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(firstRecord);

  await page.evaluate(key => localStorage.setItem(key, 'ar'), LOCALE_KEY);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#realm-collaboration-error-title')).toHaveCount(0);
  await page.locator('[data-action="open-realm-collaboration"]').click();
  await expect(page.locator('#realm-collaboration-linked-title')).toHaveText('التعاون مرتبط');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(firstRecord);
  await context.close();

  const selfContext = await createContext(browser, { realm: SOURCE, locale: 'en', viewport: VIEWPORTS[1] });
  const selfPage = await selfContext.newPage();
  await selfPage.goto(sourceProposal.url);
  await expect(selfPage.locator('#realm-collaboration-error-title')).toHaveText('Different realm required');
  expect(await selfPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
  await selfContext.close();
});
