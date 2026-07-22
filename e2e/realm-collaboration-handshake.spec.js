import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRealmCollaborationProposal } from '../src/realm-collaboration.js';
import { createRealmCollaborationConfirmation } from '../src/realm-collaboration-handshake.js';

mkdirSync('test-results/realm-collaboration-handshake', { recursive: true });
test.setTimeout(240_000);

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const COLLAB_KEY = 'creatorverse-realm-collaboration-v1';
const PENDING_KEY = 'creatorverse-realm-collaboration-pending-v1';
const LOCALE_KEY = 'creatorverse-locale';
const SOURCE = { id: 'realm_source_00000001', name: 'Signal Atlas', theme: 'cosmic' };
const RECIPIENT = { id: 'realm_local_000000002', name: 'Canopy Relay', theme: 'wild' };
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
    pending: 'Pending locally',
    confirmationReady: 'Return confirmation',
    preview: 'Complete collaboration',
    success: 'Confirmed on this realm',
    noPending: 'No pending proposal',
    linked: 'Collaboration linked',
  },
  {
    id: 'ar',
    dir: 'rtl',
    pending: 'بانتظار التأكيد محليًا',
    confirmationReady: 'أرسل التأكيد',
    preview: 'أكمل التعاون',
    success: 'تم التأكيد في هذا العالم',
    noPending: 'لا يوجد مقترح منتظر',
    linked: 'التعاون مرتبط',
  },
];

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

async function createRealmContext(browser, { realm, locale, viewport, pending = null }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeKey, localeId, ledgerKey, serializedLedger, pendingKey, serializedPending }) => {
    if (localStorage.getItem(localeKey) === null) localStorage.setItem(localeKey, localeId);
    if (localStorage.getItem(ledgerKey) === null) localStorage.setItem(ledgerKey, serializedLedger);
    if (serializedPending && localStorage.getItem(pendingKey) === null) localStorage.setItem(pendingKey, serializedPending);
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
    pendingKey: PENDING_KEY,
    serializedPending: pending ? JSON.stringify(pending) : '',
  });
  return context;
}

async function expectProfessionalQuality(page, label) {
  await expect(page.locator('[data-action="open-realm-continuation"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);

  const hierarchy = await page.evaluate(() => {
    const launch = document.querySelector('[data-action="open-realm-continuation"]');
    const collaboration = document.querySelector('[data-realm-collaboration], [data-realm-handshake-standalone]');
    return Boolean(launch && collaboration
      && (launch.compareDocumentPosition(collaboration) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(hierarchy, `${label}: mission launch stays first`).toBe(true);

  for (const control of await page.locator('[data-realm-collaboration] button:visible, [data-realm-handshake-standalone] button:visible').all()) {
    const box = await control.boundingBox();
    expect(box?.width || 0, `${label}: target width`).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, `${label}: target height`).toBeGreaterThanOrEqual(44);
  }

  await expect(page.locator('body')).not.toContainText(
    /realm_(?:source|local)|proposal_[A-Za-z0-9_-]+|creatorverse-realm-collaboration|collab-confirm=/iu,
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function createPendingProposal(page, locale) {
  const ledgerBefore = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);
  await page.locator('[data-action="open-realm-collaboration"]').click();
  await page.locator('[data-action="create-realm-collaboration"]').click();
  await expect(page.locator('#realm-handshake-title')).toHaveText(locale.pending);
  await expect(page.locator('[data-action="resume-realm-collaboration"]')).toBeFocused();
  const pending = await page.evaluate(key => localStorage.getItem(key), PENDING_KEY);
  expect(pending).not.toBeNull();
  expect(Object.keys(JSON.parse(pending)).sort()).toEqual([
    'proposalId', 'sourceName', 'sourceRealmId', 'sourceTheme', 'version',
  ]);
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);

  await page.locator('[data-action="resume-realm-collaboration"]').click();
  await expect(page.locator('[data-handshake-live]')).not.toBeEmpty();
  const proposalUrl = await page.evaluate(() => sessionStorage.getItem('__creatorverse_test_clipboard'));
  expect(proposalUrl).toContain('#collab=');
  return { proposalUrl, pending, ledgerBefore };
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} completes one reciprocal device-local handshake`, async ({ browser }) => {
      const sourceContext = await createRealmContext(browser, {
        realm: SOURCE,
        locale: locale.id,
        viewport,
      });
      const sourcePage = await sourceContext.newPage();
      await sourcePage.goto('/');
      await expect(sourcePage.locator('html')).toHaveAttribute('dir', locale.dir);
      const source = await createPendingProposal(sourcePage, locale);
      await expectProfessionalQuality(sourcePage, `${locale.id}-${viewport.width}-pending`);
      await sourcePage.screenshot({
        path: `test-results/realm-collaboration-handshake/${locale.id}-${viewport.width}x${viewport.height}-pending-awaiting-confirmation.png`,
        fullPage: true,
      });

      const recipientContext = await createRealmContext(browser, {
        realm: RECIPIENT,
        locale: locale.id,
        viewport,
      });
      const recipientPage = await recipientContext.newPage();
      const recipientLedgerBefore = JSON.stringify(ledger(RECIPIENT));
      await recipientPage.goto(source.proposalUrl);
      await recipientPage.locator('[data-action="accept-realm-collaboration"]').click();
      await expect(recipientPage.locator('#realm-collaboration-linked-title')).toHaveText(locale.linked);
      await expect(recipientPage.locator('[data-action="return-realm-collaboration-confirmation"]')).toHaveText(locale.confirmationReady);
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(recipientLedgerBefore);
      await expectProfessionalQuality(recipientPage, `${locale.id}-${viewport.width}-recipient-confirmation-ready`);
      await recipientPage.screenshot({
        path: `test-results/realm-collaboration-handshake/${locale.id}-${viewport.width}x${viewport.height}-recipient-confirmation-ready.png`,
        fullPage: true,
      });

      await recipientPage.locator('[data-action="return-realm-collaboration-confirmation"]').click();
      await expect(recipientPage.locator('[data-handshake-live]')).not.toBeEmpty();
      const confirmationUrl = await recipientPage.evaluate(() => sessionStorage.getItem('__creatorverse_test_clipboard'));
      expect(confirmationUrl).toContain('#collab-confirm=');
      const recipientRecord = await recipientPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY);
      expect(recipientRecord).not.toBeNull();

      await sourcePage.goto(confirmationUrl);
      await expect(sourcePage).toHaveURL(/\/$/u);
      await expect(sourcePage.locator('#realm-handshake-title')).toHaveText(locale.preview);
      await expect(sourcePage.locator('#realm-handshake-title')).toBeFocused();
      await expect(sourcePage.locator('.realm-handshake-realm strong')).toHaveText([SOURCE.name, RECIPIENT.name]);
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), PENDING_KEY)).toBe(source.pending);
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
      await expectProfessionalQuality(sourcePage, `${locale.id}-${viewport.width}-proposer-preview`);
      await sourcePage.screenshot({
        path: `test-results/realm-collaboration-handshake/${locale.id}-${viewport.width}x${viewport.height}-proposer-preview.png`,
        fullPage: true,
      });

      await sourcePage.locator('[data-action="confirm-realm-collaboration-handshake"]').click();
      await expect(sourcePage.locator('#realm-handshake-title')).toHaveText(locale.success);
      await expect(sourcePage.locator('#realm-handshake-title')).toBeFocused();
      const sourceRecord = await sourcePage.evaluate(key => localStorage.getItem(key), COLLAB_KEY);
      expect(sourceRecord).not.toBeNull();
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), PENDING_KEY)).toBeNull();
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(source.ledgerBefore);
      const sourceParsed = JSON.parse(sourceRecord);
      const recipientParsed = JSON.parse(recipientRecord);
      expect(sourceParsed.proposalId).toBe(recipientParsed.proposalId);
      expect(sourceParsed.localRealmId).toBe(recipientParsed.sourceRealmId);
      expect(sourceParsed.sourceRealmId).toBe(recipientParsed.localRealmId);
      await expectProfessionalQuality(sourcePage, `${locale.id}-${viewport.width}-reciprocal-success`);
      await sourcePage.screenshot({
        path: `test-results/realm-collaboration-handshake/${locale.id}-${viewport.width}x${viewport.height}-reciprocal-success.png`,
        fullPage: true,
      });

      await sourcePage.goto(confirmationUrl);
      await expect(sourcePage.locator('#realm-handshake-title')).toHaveText(locale.success);
      await expect(sourcePage.locator('[data-handshake-live]')).toBeEmpty();
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(sourceRecord);

      const noPendingContext = await createRealmContext(browser, {
        realm: SOURCE,
        locale: locale.id,
        viewport,
      });
      const noPendingPage = await noPendingContext.newPage();
      await noPendingPage.goto(confirmationUrl);
      await expect(noPendingPage.locator('#realm-handshake-title')).toHaveText(locale.noPending);
      await expectProfessionalQuality(noPendingPage, `${locale.id}-${viewport.width}-no-pending`);
      await noPendingPage.screenshot({
        path: `test-results/realm-collaboration-handshake/${locale.id}-${viewport.width}x${viewport.height}-no-pending-recovery.png`,
        fullPage: true,
      });

      await recipientPage.locator('[data-action="remove-realm-collaboration"]').click();
      await expect(recipientPage.locator('[role="dialog"]')).toBeVisible();
      await expectProfessionalQuality(recipientPage, `${locale.id}-${viewport.width}-local-removal`);
      await recipientPage.screenshot({
        path: `test-results/realm-collaboration-handshake/${locale.id}-${viewport.width}x${viewport.height}-local-removal-confirmation.png`,
        fullPage: true,
      });
      await recipientPage.locator('[data-action="confirm-remove-realm-collaboration"]').click();
      expect(await recipientPage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(sourceRecord);

      const opposite = locale.id === 'en' ? 'ar' : 'en';
      await sourcePage.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: LOCALE_KEY, value: opposite });
      await sourcePage.reload();
      await sourcePage.locator('[data-action="open-realm-collaboration"]').click();
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBe(sourceRecord);
      expect(await sourcePage.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(source.ledgerBefore);

      await noPendingContext.close();
      await sourceContext.close();
      await recipientContext.close();
    });
  }
}

test('confirmation storage failure preserves the pending proposal atomically', async ({ browser, baseURL }) => {
  const proposal = createRealmCollaborationProposal(SOURCE, {
    cryptoLike: { randomUUID: () => '12345678-1234-4234-9234-123456789abc' },
    baseUrl: `${baseURL}/`,
  }).proposal;
  const recipientRecord = {
    version: 1,
    localRealmId: RECIPIENT.id,
    sourceRealmId: SOURCE.id,
    proposalId: proposal.proposalId,
    sourceName: SOURCE.name,
    sourceTheme: SOURCE.theme,
  };
  const confirmation = createRealmCollaborationConfirmation(RECIPIENT, recipientRecord, {
    baseUrl: `${baseURL}/`,
  });
  const context = await createRealmContext(browser, {
    realm: SOURCE,
    locale: 'en',
    viewport: VIEWPORTS[1],
    pending: proposal,
  });
  const page = await context.newPage();
  await page.goto(confirmation.url);
  await expect(page.locator('#realm-handshake-title')).toHaveText('Complete collaboration');
  await page.evaluate(pendingKey => {
    const original = Storage.prototype.removeItem;
    Object.defineProperty(window, '__creatorverseOriginalRemoveItem', {
      configurable: true,
      value: original,
    });
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === pendingKey) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, key);
    };
  }, PENDING_KEY);
  await page.locator('[data-action="confirm-realm-collaboration-handshake"]').click();
  await expect(page.locator('#realm-handshake-title')).toHaveText('Link not saved');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), PENDING_KEY)).toBe(JSON.stringify(proposal));
  await expectProfessionalQuality(page, 'storage-error');
  await context.close();
});

test('confirmation preview remains operable at 200 percent text zoom and orientation changes', async ({ browser, baseURL }) => {
  const proposal = createRealmCollaborationProposal(SOURCE, {
    cryptoLike: { randomUUID: () => '12345678-1234-4234-9234-123456789abc' },
    baseUrl: `${baseURL}/`,
  }).proposal;
  const recipientRecord = {
    version: 1,
    localRealmId: RECIPIENT.id,
    sourceRealmId: SOURCE.id,
    proposalId: proposal.proposalId,
    sourceName: SOURCE.name,
    sourceTheme: SOURCE.theme,
  };
  const confirmation = createRealmCollaborationConfirmation(RECIPIENT, recipientRecord, {
    baseUrl: `${baseURL}/`,
  });
  const context = await createRealmContext(browser, {
    realm: SOURCE,
    locale: 'ar',
    viewport: VIEWPORTS[0],
    pending: proposal,
  });
  const page = await context.newPage();
  await page.goto(confirmation.url);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.locator('[data-action="confirm-realm-collaboration-handshake"]')).toBeVisible();
  await expectProfessionalQuality(page, 'zoom-portrait');
  await page.setViewportSize({ width: 568, height: 320 });
  await expect(page.locator('#realm-handshake-title')).toHaveText('أكمل التعاون');
  await expectProfessionalQuality(page, 'zoom-landscape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-action="confirm-realm-collaboration-handshake"]')).toBeVisible();
  await expectProfessionalQuality(page, 'zoom-restored');
  await context.close();
});
