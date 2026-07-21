import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRealmCollaborationProposal } from '../src/realm-collaboration.js';

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const COLLAB_KEY = 'creatorverse-realm-collaboration-v1';
const LOCALE_KEY = 'creatorverse-locale';
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

function proposalUrl(baseURL) {
  return createRealmCollaborationProposal(SOURCE, {
    cryptoLike: { randomUUID: () => '12345678-1234-4234-9234-123456789abc' },
    baseUrl: new URL('/', baseURL).href,
  }).url;
}

function rawToken(serialized) {
  return Buffer.from(serialized, 'utf8').toString('base64url');
}

async function createContext(browser, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ ledgerKey, collaborationKey, localeKey, serializedLedger }) => {
    if (localStorage.getItem(localeKey) === null) localStorage.setItem(localeKey, 'en');
    if (localStorage.getItem(ledgerKey) === null) localStorage.setItem(ledgerKey, serializedLedger);
    localStorage.removeItem(collaborationKey);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  }, {
    ledgerKey: LEDGER_KEY,
    collaborationKey: COLLAB_KEY,
    localeKey: LOCALE_KEY,
    serializedLedger: JSON.stringify(ledger(LOCAL)),
  });
  return context;
}

async function expectNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(1);
}

async function expectNoSeriousAxeViolations(page) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
}

test('unknown, oversized, and atomic storage-failure paths fail closed and recover', async ({ browser, baseURL }) => {
  const context = await createContext(browser);
  const page = await context.newPage();
  const ledgerBefore = JSON.stringify(ledger(LOCAL));

  const unknownField = rawToken(
    'v=1&pid=proposal_12345678123442349234123456789abc&rid=realm_source_00000001&n=Signal+Atlas&t=cosmic&x=1',
  );
  await page.goto(`/#collab=${unknownField}`);
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator('#realm-collaboration-error-title')).toHaveText('Proposal unavailable');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);

  await page.goto(`/#collab=${'a'.repeat(769)}`);
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator('#realm-collaboration-error-title')).toHaveText('Proposal unavailable');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();

  await page.goto(proposalUrl(baseURL));
  await expect(page.locator('#realm-collaboration-preview-title')).toHaveText('Review realm link');
  await page.evaluate(collaborationKey => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, '__creatorverseOriginalStorageSetItem', {
      configurable: true,
      value: original,
    });
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === collaborationKey) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  }, COLLAB_KEY);

  await page.locator('[data-action="accept-realm-collaboration"]').click();
  await expect(page.locator('#realm-collaboration-error-title')).toHaveText('Link not saved');
  await expect(page.locator('#realm-collaboration-error-title')).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
  const retryBox = await page.locator('[data-action="retry-realm-collaboration"]').boundingBox();
  expect(retryBox?.width || 0).toBeGreaterThanOrEqual(44);
  expect(retryBox?.height || 0).toBeGreaterThanOrEqual(44);
  await expectNoOverflow(page, 'storage failure must not overflow');
  await expectNoSeriousAxeViolations(page);

  await page.evaluate(() => {
    Storage.prototype.setItem = window.__creatorverseOriginalStorageSetItem;
    delete window.__creatorverseOriginalStorageSetItem;
  });
  await page.locator('[data-action="retry-realm-collaboration"]').click();
  await expect(page.locator('#realm-collaboration-preview-title')).toHaveText('Review realm link');
  await page.locator('[data-action="accept-realm-collaboration"]').click();
  await expect(page.locator('#realm-collaboration-linked-title')).toHaveText('Collaboration linked');
  expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).not.toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
  await expectNoSeriousAxeViolations(page);
  await context.close();
});

test('collaboration preview survives 200 percent text reflow and orientation changes', async ({ browser, baseURL }) => {
  const context = await createContext(browser, { width: 320, height: 568 });
  const page = await context.newPage();
  await page.goto(proposalUrl(baseURL));
  await expect(page.locator('#realm-collaboration-preview-title')).toHaveText('Review realm link');

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(page.locator('[data-action="open-realm-continuation"]')).toBeVisible();
  await expect(page.locator('[data-action="accept-realm-collaboration"]')).toBeVisible();
  await expectNoOverflow(page, '200 percent text reflow must not overflow');

  await page.setViewportSize({ width: 568, height: 320 });
  await expect(page.locator('#realm-collaboration-preview-title')).toHaveText('Review realm link');
  await expectNoOverflow(page, 'landscape orientation must not overflow');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#realm-collaboration-preview-title')).toHaveText('Review realm link');
  await expectNoOverflow(page, 'portrait resize must not overflow');
  const acceptBox = await page.locator('[data-action="accept-realm-collaboration"]').boundingBox();
  expect(acceptBox?.width || 0).toBeGreaterThanOrEqual(44);
  expect(acceptBox?.height || 0).toBeGreaterThanOrEqual(44);
  await expectNoSeriousAxeViolations(page);

  await page.locator('[data-action="accept-realm-collaboration"]').click();
  await expect(page.locator('#realm-collaboration-linked-title')).toHaveText('Collaboration linked');
  await context.close();
});
