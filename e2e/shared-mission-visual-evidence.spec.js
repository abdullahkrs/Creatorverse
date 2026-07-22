import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

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
  { id: 'en', dir: 'ltr', trigger: 'Shared mission' },
  { id: 'ar', dir: 'rtl', trigger: 'مهمة مشتركة' },
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

async function screenshot(page, locale, viewport, state) {
  await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${locale.id}-${viewport.width}-${state}: horizontal overflow`).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `test-results/shared-mission/${locale.id}-${viewport.width}x${viewport.height}-${state}.png`,
    fullPage: true,
  });
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} captures every required shared-mission visual state`, async ({ browser }) => {
      const creatorContext = await createContext(browser, { realm: SOURCE, source: LINKED, locale: locale.id, viewport });
      const followerContext = await createContext(browser, { locale: locale.id, viewport });
      const wrongRealmContext = await createContext(browser, { realm: LINKED, source: SOURCE, locale: locale.id, viewport });
      const creator = await creatorContext.newPage();
      const follower = await followerContext.newPage();
      const wrongRealm = await wrongRealmContext.newPage();

      await creator.goto('/');
      await creator.locator('[data-action="open-realm-collaboration"]').click();
      await expect(creator.locator('[data-action="open-shared-mission"]')).toHaveText(locale.trigger);
      await screenshot(creator, locale, viewport, 'saved-realm-shared-action');

      await creator.locator('[data-action="open-shared-mission"]').click();
      await expect(creator.locator('[data-shared-mission][data-state="selection"]')).toBeVisible();
      await expect(creator.locator('#shared-mission-title')).toBeFocused();
      await screenshot(creator, locale, viewport, 'selection');

      await creator.locator('[data-form="shared-mission"] [data-action="create-shared-mission"]').click();
      await expect(creator.locator('[data-shared-mission][data-state="invite-ready"]')).toBeVisible();
      await screenshot(creator, locale, viewport, 'invite-ready');

      await creator.locator('[data-action="share-shared-mission"]').click();
      const inviteUrl = await clipboardUrl(creator, 'shared-mission');

      await follower.goto(inviteUrl);
      await expect(follower).toHaveURL(/\/$/u);
      await expect(follower.locator('[data-shared-mission][data-state="active"]')).toBeVisible();
      await expect(follower.locator('.shared-mission-realm strong')).toHaveText([SOURCE.name, LINKED.name]);
      await screenshot(follower, locale, viewport, 'follower-active');

      await follower.locator('[data-action="select-shared-role"][data-role="builder"]').click();
      await follower.locator('[data-action="activate-shared-mission"][data-command="sky"]').click();
      await expect(follower.locator('[data-shared-mission][data-state="complete"]')).toBeVisible();
      await expect(follower.locator('[data-action="share-shared-receipt"]')).toHaveCount(2);

      if (viewport.width === 320) {
        await follower.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await screenshot(follower, locale, viewport, '200-percent-bilingual-evidence');
        await follower.evaluate(() => { document.documentElement.style.fontSize = ''; });
      }

      await follower.locator('[data-action="share-shared-receipt"][data-receipt-index="0"]').click();
      const receiptA = await clipboardUrl(follower, 'shared-receipt');

      await wrongRealm.goto(receiptA);
      await expect(wrongRealm).toHaveURL(/\/$/u);
      await expect(wrongRealm.locator('[data-shared-mission][data-state="wrong-realm"]')).toBeVisible();
      await expect(wrongRealm.locator('[data-action="discard-shared-receipt"]')).toBeVisible();
      expect(await wrongRealm.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0].total, LEDGER_KEY)).toBe(0);
      await screenshot(wrongRealm, locale, viewport, 'wrong-realm-recovery');

      await creatorContext.close();
      await followerContext.close();
      await wrongRealmContext.close();
    });
  }
}
