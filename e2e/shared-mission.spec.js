import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

mkdirSync('test-results/shared-mission', { recursive: true });
test.setTimeout(240_000);

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const COLLAB_KEY = 'creatorverse-realm-collaboration-v1';
const LOCALE_KEY = 'creatorverse-locale';
const SOURCE = { id: 'realm_source_00000001', name: 'Signal Atlas', theme: 'cosmic' };
const LINKED = { id: 'realm_linked_00000002', name: 'Canopy Relay', theme: 'wild' };
const RELATIONSHIP_ID = 'proposal_000000000000000000000017';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', trigger: 'Shared mission', result: 'Two receipts ready', preview: 'Import shared contribution', success: '+3 imported locally' },
  { id: 'ar', dir: 'rtl', trigger: 'مهمة مشتركة', result: 'إيصالان جاهزان', preview: 'استورد المساهمة المشتركة', success: 'تم استيراد +٣ محليًا' },
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

function reciprocalRecord(local, source) {
  return {
    version: 1,
    localRealmId: local.id,
    sourceRealmId: source.id,
    proposalId: RELATIONSHIP_ID,
    sourceName: source.name,
    sourceTheme: source.theme,
  };
}

async function createContext(browser, { realm = null, source = null, locale, viewport }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeKey, localeId, ledgerKey, serializedLedger, collaborationKey, serializedCollaboration }) => {
    localStorage.setItem(localeKey, localeId);
    if (serializedLedger) localStorage.setItem(ledgerKey, serializedLedger);
    if (serializedCollaboration) localStorage.setItem(collaborationKey, serializedCollaboration);
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
    serializedLedger: realm ? JSON.stringify(ledger(realm)) : '',
    collaborationKey: COLLAB_KEY,
    serializedCollaboration: realm && source ? JSON.stringify(reciprocalRecord(realm, source)) : '',
  });
  return context;
}

async function clipboardUrl(page, fragment) {
  const copied = await page.evaluate(() => sessionStorage.getItem('__creatorverse_test_clipboard'));
  expect(copied).toContain(`#${fragment}=`);
  return copied.split(/\r?\n/u).at(-1);
}

async function assertQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  for (const control of await page.locator('[data-shared-mission] button:visible').all()) {
    const box = await control.boundingBox();
    expect(box?.width || 0, `${label}: target width`).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, `${label}: target height`).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('body')).not.toContainText(
    /realm_(?:source|linked)|proposal_[A-Za-z0-9_-]+|creatorverse-shared|shared-(?:mission|receipt)=/iu,
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function launchSharedInvite(page, locale) {
  const ledgerBefore = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);
  await page.locator('[data-action="open-realm-collaboration"]').click();
  await expect(page.locator('[data-action="open-shared-mission"]')).toHaveText(locale.trigger);
  const hierarchy = await page.evaluate(() => {
    const primary = document.querySelector('[data-action="open-realm-continuation"]');
    const secondary = document.querySelector('[data-action="open-shared-mission"]');
    return Boolean(primary && secondary && (primary.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(hierarchy).toBe(true);
  await page.locator('[data-action="open-shared-mission"]').click();
  await expect(page.locator('#shared-mission-title')).toBeFocused();
  await page.locator('[data-form="shared-mission"] [data-action="create-shared-mission"]').click();
  await expect(page.locator('[data-shared-mission][data-state="invite-ready"]')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
  await page.locator('[data-action="share-shared-mission"]').click();
  await expect(page.locator('[data-shared-live]')).not.toBeEmpty();
  expect(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).toBe(ledgerBefore);
  return { url: await clipboardUrl(page, 'shared-mission'), ledgerBefore };
}

async function completeFollower(page, locale) {
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
  await expect(page.locator('[data-shared-mission][data-state="active"]')).toBeVisible();
  await expect(page.locator('.shared-mission-realm strong')).toHaveText([SOURCE.name, LINKED.name]);
  await page.locator('[data-action="select-shared-role"][data-role="builder"]').click();
  await page.locator('[data-action="activate-shared-mission"][data-command="sky"]').click();
  await expect(page.locator('#shared-mission-follower-title')).toHaveText(locale.result);
  await expect(page.locator('#shared-mission-follower-title')).toBeFocused();
  await expect(page.locator('[data-action="share-shared-receipt"]')).toHaveCount(2);
  await expect(page.locator('[data-receipt-index="0"]')).toContainText(SOURCE.name);
  await expect(page.locator('[data-receipt-index="1"]')).toContainText(LINKED.name);

  await page.locator('[data-action="share-shared-receipt"][data-receipt-index="0"]').click();
  const receiptA = await clipboardUrl(page, 'shared-receipt');
  await page.locator('[data-action="share-shared-receipt"][data-receipt-index="1"]').click();
  const receiptB = await clipboardUrl(page, 'shared-receipt');
  expect(receiptA).not.toBe(receiptB);
  await expect(page.locator('.shared-mission-receipt-action[data-receipt-card-index="0"] .shared-mission-status')).not.toBeEmpty();
  await expect(page.locator('.shared-mission-receipt-action[data-receipt-card-index="1"] .shared-mission-status')).not.toBeEmpty();
  return { receiptA, receiptB };
}

async function importReceipt(page, receiptUrl, locale) {
  await page.goto(receiptUrl);
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator('#shared-mission-import-title')).toHaveText(locale.preview);
  await expect(page.locator('#shared-mission-import-title')).toBeFocused();
  await page.locator('[data-action="import-shared-receipt"]').click();
  await expect(page.locator('#shared-mission-import-title')).toHaveText(locale.success);
  const realm = JSON.parse(await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY)).realms[0];
  expect(realm.total).toBe(3);
  expect(realm.receipts).toHaveLength(1);
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} completes one equal shared mission across three isolated contexts`, async ({ browser }) => {
      const creatorAContext = await createContext(browser, { realm: SOURCE, source: LINKED, locale: locale.id, viewport });
      const creatorBContext = await createContext(browser, { realm: LINKED, source: SOURCE, locale: locale.id, viewport });
      const followerContext = await createContext(browser, { locale: locale.id, viewport });
      const creatorA = await creatorAContext.newPage();
      const creatorB = await creatorBContext.newPage();
      const follower = await followerContext.newPage();

      await creatorA.goto('/');
      await creatorB.goto('/');
      const invite = await launchSharedInvite(creatorA, locale);
      expect(await creatorB.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0].total, LEDGER_KEY)).toBe(0);

      await follower.goto(invite.url);
      const receipts = await completeFollower(follower, locale);
      await assertQuality(follower, `${locale.id}-${viewport.width}-follower-complete`);
      await follower.screenshot({
        path: `test-results/shared-mission/${locale.id}-${viewport.width}x${viewport.height}-two-receipts.png`,
        fullPage: true,
      });

      await creatorB.goto(receipts.receiptA);
      await expect(creatorB.locator('[data-shared-mission][data-state="wrong-realm"]')).toBeVisible();
      expect(await creatorB.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0].total, LEDGER_KEY)).toBe(0);
      await creatorB.locator('[data-action="discard-shared-receipt"]').click();

      await importReceipt(creatorA, receipts.receiptA, locale);
      await assertQuality(creatorA, `${locale.id}-${viewport.width}-creator-a-import`);
      await creatorA.screenshot({
        path: `test-results/shared-mission/${locale.id}-${viewport.width}x${viewport.height}-creator-a-import.png`,
        fullPage: true,
      });
      await importReceipt(creatorB, receipts.receiptB, locale);
      await assertQuality(creatorB, `${locale.id}-${viewport.width}-creator-b-import`);

      await creatorA.goto(receipts.receiptA);
      await creatorA.locator('[data-action="import-shared-receipt"]').click();
      await expect(creatorA.locator('[data-shared-mission][data-state="duplicate"]')).toBeVisible();
      expect(await creatorA.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0].total, LEDGER_KEY)).toBe(3);

      const followerState = await follower.evaluate(() => ({
        ledger: localStorage.getItem('creatorverse-creator-ledger-v1'),
        result: sessionStorage.getItem('creatorverse-shared-mission-progress-v1'),
      }));
      expect(followerState.ledger).toBeNull();
      expect(JSON.parse(followerState.result).result.receipts).toHaveLength(2);

      await creatorAContext.close();
      await creatorBContext.close();
      await followerContext.close();
    });
  }
}

test('removed collaboration and 200% zoom fail closed without hiding actions', async ({ browser }) => {
  const viewport = { width: 320, height: 568 };
  const creatorContext = await createContext(browser, { realm: SOURCE, source: LINKED, locale: 'en', viewport });
  const followerContext = await createContext(browser, { locale: 'en', viewport });
  const removedContext = await createContext(browser, { realm: LINKED, source: SOURCE, locale: 'en', viewport });
  const creator = await creatorContext.newPage();
  const follower = await followerContext.newPage();
  const removed = await removedContext.newPage();
  await creator.goto('/');
  const invite = await launchSharedInvite(creator, LOCALES[0]);
  await follower.goto(invite.url);
  const receipts = await completeFollower(follower, LOCALES[0]);

  await removed.goto('/');
  await removed.evaluate(key => localStorage.removeItem(key), COLLAB_KEY);
  await removed.goto(receipts.receiptB);
  await expect(removed.locator('[data-shared-mission][data-state="collaboration-removed"]')).toBeVisible();
  expect(await removed.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0].total, LEDGER_KEY)).toBe(0);

  await follower.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(follower.locator('[data-action="share-shared-receipt"]')).toHaveCount(2);
  await assertQuality(follower, 'shared-mission-200-percent');
  await follower.screenshot({ path: 'test-results/shared-mission/en-320x568-200-percent.png', fullPage: true });

  await creatorContext.close();
  await followerContext.close();
  await removedContext.close();
});
