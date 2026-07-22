import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { encodeSharedMissionReceipt } from '../src/shared-mission.js';

mkdirSync('test-results/shared-provenance', { recursive: true });
test.setTimeout(180_000);

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const COLLAB_KEY = 'creatorverse-realm-collaboration-v1';
const LOCALE_KEY = 'creatorverse-locale';
const LOCAL = { id: 'realm_local_00000001', name: 'Signal Atlas', theme: 'cosmic' };
const PARTNER = { id: 'realm_partner_000001', name: 'Canopy Relay', theme: 'wild' };
const RELATIONSHIP_ID = 'proposal_000000000000000000000018';
const SHARED_MISSION_ID = 'mission_000000000000000000000018';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', marker: 'Shared mission', success: '+3 imported locally', launch: 'Launch next mission' },
  { id: 'ar', dir: 'rtl', marker: 'مهمة مشتركة', success: 'تم استيراد +٣ محليًا', launch: 'أطلق المهمة التالية' },
];

function soloEntry() {
  return {
    id: 'receipt_solo_00000001',
    missionId: 'signal-match',
    roleId: 'guardian',
    routeId: 'ocean',
    districtId: 'beacon-district',
    contribution: 3,
  };
}

function ledger() {
  return {
    version: 1,
    realms: [{
      ...LOCAL,
      total: 3,
      districtId: 'beacon-district',
      unlocked: true,
      receipts: [soloEntry()],
    }],
  };
}

function collaboration() {
  return {
    version: 1,
    localRealmId: LOCAL.id,
    sourceRealmId: PARTNER.id,
    proposalId: RELATIONSHIP_ID,
    sourceName: PARTNER.name,
    sourceTheme: PARTNER.theme,
  };
}

function sharedReceiptToken() {
  return encodeSharedMissionReceipt({
    version: 1,
    sharedMissionId: SHARED_MISSION_ID,
    completionId: 'completion_00000000000000000018',
    receiptId: 'receipt_000000000000000000018',
    relationshipId: RELATIONSHIP_ID,
    initiatorRealmId: LOCAL.id,
    initiatorName: LOCAL.name,
    initiatorTheme: LOCAL.theme,
    linkedRealmId: PARTNER.id,
    linkedName: PARTNER.name,
    linkedTheme: PARTNER.theme,
    targetRealmId: LOCAL.id,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    contribution: 3,
    districtId: 'beacon-district',
  });
}

async function createContext(browser, locale, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeKey, localeId, ledgerKey, ledgerValue, collaborationKey, collaborationValue }) => {
    const seedKey = '__creatorverse_shared_provenance_seeded';
    if (sessionStorage.getItem(seedKey) !== 'true') {
      localStorage.setItem(localeKey, localeId);
      localStorage.setItem(ledgerKey, ledgerValue);
      localStorage.setItem(collaborationKey, collaborationValue);
      sessionStorage.setItem(seedKey, 'true');
    }
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  }, {
    localeKey: LOCALE_KEY,
    localeId: locale,
    ledgerKey: LEDGER_KEY,
    ledgerValue: JSON.stringify(ledger()),
    collaborationKey: COLLAB_KEY,
    collaborationValue: JSON.stringify(collaboration()),
  });
  return context;
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('[data-action="open-realm-continuation"]');
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box?.width || 0, `${label}: primary width`).toBeGreaterThanOrEqual(44);
  expect(box?.height || 0, `${label}: primary height`).toBeGreaterThanOrEqual(44);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function importAndOpenChronicle(page, locale) {
  await page.goto(`/#shared-receipt=${sharedReceiptToken()}`);
  await page.locator('[data-action="import-shared-receipt"]').click();
  await expect(page.locator('#shared-mission-import-title')).toHaveText(locale.success);
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY);
  expect(state.realms[0].total).toBe(6);
  expect(state.realms[0].receipts).toHaveLength(2);
  expect(state.realms[0].receipts[1].provenance).toEqual({
    version: 1,
    sourceKind: 'shared',
    relationshipId: RELATIONSHIP_ID,
    partnerRealmId: PARTNER.id,
    partnerName: PARTNER.name,
    sharedMissionId: SHARED_MISSION_ID,
  });
  await page.locator('[data-action="discard-shared-receipt"]').click();
  await expect(page.locator('[data-realm-continuation][data-state="ready"]')).toBeVisible();
  await expect(page.locator('.realm-chronicle-entry')).toHaveCount(2);
  await expect(page.locator('[data-shared-provenance]')).toHaveCount(1);
  await expect(page.locator('[data-shared-provenance]')).toContainText(locale.marker);
  await expect(page.locator('[data-shared-provenance] bdi')).toHaveText(PARTNER.name);
  await expect(page.locator('.realm-chronicle-entry').first()).toContainText('+3');
  await expect(page.locator('.realm-chronicle-entry').last().locator('[data-shared-provenance]')).toHaveCount(0);
  await expect(page.locator('[data-shared-provenance]')).not.toHaveAttribute('tabindex');
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} preserves one truthful shared chronicle marker`, async ({ browser }) => {
      const context = await createContext(browser, locale.id, viewport);
      const page = await context.newPage();
      await importAndOpenChronicle(page, locale);
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('[data-action="open-realm-continuation"]')).toHaveText(locale.launch);

      const primaryBeforeChronicle = await page.evaluate(() => {
        const primary = document.querySelector('[data-action="open-realm-continuation"]');
        const chronicle = document.querySelector('[data-realm-chronicle]');
        return Boolean(primary && chronicle && (primary.compareDocumentPosition(chronicle) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      expect(primaryBeforeChronicle).toBe(true);

      await page.evaluate(key => localStorage.removeItem(key), COLLAB_KEY);
      await page.reload();
      expect(await page.evaluate(key => localStorage.getItem(key), COLLAB_KEY)).toBeNull();
      await expect(page.locator('[data-shared-provenance]')).toHaveCount(1);
      await expect(page.locator('[data-shared-provenance] bdi')).toHaveText(PARTNER.name);
      await expect(page.locator('body')).not.toContainText(
        new RegExp(`${LOCAL.id}|${PARTNER.id}|${RELATIONSHIP_ID}|${SHARED_MISSION_ID}`, 'u'),
      );
      await expect(page.locator('body')).not.toContainText(/audience crossover|delivered|verified identity|shared progress/iu);
      await expectQuality(page, `${locale.id}-${viewport.width}-shared-provenance`);
      await page.screenshot({
        path: `test-results/shared-provenance/${locale.id}-${viewport.width}x${viewport.height}-mixed-removed.png`,
        fullPage: true,
      });
      await context.close();
    });
  }
}

test('320px shared provenance remains readable at 200% text size', async ({ browser }) => {
  const context = await createContext(browser, 'en', VIEWPORTS[0]);
  const page = await context.newPage();
  await importAndOpenChronicle(page, LOCALES[0]);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.locator('[data-shared-provenance]')).toBeVisible();
  const metrics = await page.locator('[data-shared-provenance]').evaluate(element => {
    const box = element.getBoundingClientRect();
    const row = element.closest('.realm-chronicle-entry').getBoundingClientRect();
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      width: box.width,
      left: box.left,
      right: box.right,
      rowWidth: row.width,
    };
  });
  expect(metrics.pageWidth - metrics.viewportWidth).toBeLessThanOrEqual(1);
  expect(metrics.width).toBeGreaterThanOrEqual(metrics.rowWidth * 0.55);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  await expectQuality(page, 'en-320-shared-provenance-200-percent');
  await page.screenshot({
    path: 'test-results/shared-provenance/en-320x568-200-percent.png',
    fullPage: true,
  });
  await context.close();
});
