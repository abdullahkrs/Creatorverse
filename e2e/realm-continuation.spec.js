import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

mkdirSync('test-results/realm-continuation', { recursive: true });
test.setTimeout(240_000);

const LEDGER_KEY = 'creatorverse-creator-ledger-v1';
const REALM_ID = 'realm_abcdefghijklmnop';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LOCALES = [
  { id: 'en', dir: 'ltr', launch: 'Launch next mission', ready: 'Invite ready' },
  { id: 'ar', dir: 'rtl', launch: 'أطلق المهمة التالية', ready: 'الدعوة جاهزة' },
];

function savedRealmLedger({ total = 3 } = {}) {
  const receipts = total === 0 ? [] : [{
    id: 'receipt_seed0000000001',
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    districtId: 'beacon-district',
    contribution: 3,
  }];
  return {
    version: 1,
    realms: [{
      id: REALM_ID,
      name: 'Nova Guild',
      theme: 'cosmic',
      total,
      districtId: 'beacon-district',
      unlocked: total >= 3,
      receipts,
    }],
  };
}

async function createContext(browser, {
  locale = 'en',
  viewport = VIEWPORTS[1],
  ledger = savedRealmLedger(),
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ localeId, serializedLedger }) => {
    if (!sessionStorage.getItem('__creatorverseContinuationSeeded')) {
      if (!localStorage.getItem('creatorverse-locale')) localStorage.setItem('creatorverse-locale', localeId);
      if (!localStorage.getItem('creatorverse-creator-ledger-v1')) {
        localStorage.setItem('creatorverse-creator-ledger-v1', serializedLedger);
      }
      sessionStorage.setItem('__creatorverseContinuationSeeded', '1');
    }
    window.__cvClipboard = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__cvClipboard = String(value); } },
    });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  }, { localeId: locale, serializedLedger: JSON.stringify(ledger) });
  return context;
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
  const primary = page.locator('[data-realm-continuation] button.primary').first();
  if (await primary.count()) {
    const box = await primary.boundingBox();
    expect(box?.width || 0, `${label} primary width`).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0, `${label} primary height`).toBeGreaterThanOrEqual(44);
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} saved realm ready, selected, success, and recovery evidence`, async ({ browser }) => {
      const context = await createContext(browser, { locale: locale.id, viewport });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
      await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'ready');
      await expect(page.locator('[data-action="open-realm-continuation"]')).toHaveText(locale.launch);
      await expect(page.locator('.experience')).toBeHidden();
      await expectQuality(page, `${locale.id} ${viewport.width} ready`);
      await page.screenshot({
        path: `test-results/realm-continuation/${locale.id}-${viewport.width}x${viewport.height}-ready.png`,
        fullPage: true,
      });

      await page.locator('[data-action="open-realm-continuation"]').click();
      await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'selected');
      await expect(page.locator('#realm-continuation-title')).toBeFocused();
      await page.locator('input[name="continuation-mission"][value="signal-match"]').check();
      await page.locator('input[name="continuation-schedule"][value="now-24h"]').check();
      await expectQuality(page, `${locale.id} ${viewport.width} selected`);
      await page.screenshot({
        path: `test-results/realm-continuation/${locale.id}-${viewport.width}x${viewport.height}-selected.png`,
        fullPage: true,
      });

      const before = await page.evaluate(key => localStorage.getItem(key), LEDGER_KEY);
      await page.locator('[data-form="realm-continuation"]').evaluate(form => form.requestSubmit());
      await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'success');
      await expect(page.locator('#realm-continuation-result-title')).toHaveText(locale.ready);
      await expect(page.locator('#realm-continuation-result-title')).toBeFocused();
      const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY);
      const beforeParsed = JSON.parse(before);
      expect(after.realms[0].total).toBe(beforeParsed.realms[0].total);
      expect(after.realms[0].receipts).toEqual(beforeParsed.realms[0].receipts);
      expect(after.realms[0].missions).toHaveLength(1);
      expect(after.realms[0].missions[0].consumed).toBe(false);
      await expectQuality(page, `${locale.id} ${viewport.width} success`);
      await page.screenshot({
        path: `test-results/realm-continuation/${locale.id}-${viewport.width}x${viewport.height}-success.png`,
        fullPage: true,
      });

      await page.reload();
      await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'success');
      await expect(page.locator('#realm-continuation-result-title')).toHaveText(locale.ready);
      expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEDGER_KEY)).realms[0].total).toBe(3);
      await context.close();

      const malformed = await createContext(browser, {
        locale: locale.id,
        viewport,
        ledger: { version: 1, realms: [{ id: REALM_ID, extra: '<script>' }] },
      });
      const errorPage = await malformed.newPage();
      await errorPage.goto('/');
      await expect(errorPage.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'error');
      await expect(errorPage.locator('#realm-continuation-error-title')).toBeFocused();
      await expect(errorPage.locator('body')).not.toContainText('<script>');
      await expectQuality(errorPage, `${locale.id} ${viewport.width} error`);
      await errorPage.screenshot({
        path: `test-results/realm-continuation/${locale.id}-${viewport.width}x${viewport.height}-error.png`,
        fullPage: true,
      });
      await errorPage.locator('[data-action="recover-realm-continuation"]').click();
      await expect(errorPage.locator('[data-realm-continuation]')).toHaveCount(0);
      await expect(errorPage.locator('.experience')).toBeVisible();
      await malformed.close();
    });
  }
}

test('keyboard, locale reload, resize, zoom, and cancellation preserve a bounded selection', async ({ browser }) => {
  const context = await createContext(browser, { viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  await page.goto('/');

  for (let index = 0; index < 8; index += 1) {
    if (await page.locator('[data-action="open-realm-continuation"]').evaluate(button => button === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('[data-action="open-realm-continuation"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#realm-continuation-title')).toBeFocused();
  await page.locator('input[name="continuation-mission"][value="relay-sequence"]').check();
  await page.locator('input[name="continuation-schedule"][value="in-1h-24h"]').check();

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.setViewportSize(VIEWPORTS[3]);
  await expectQuality(page, 'zoomed selected continuation');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('[data-locale="ar"]').click(),
  ]);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'selected');
  await expect(page.locator('input[name="continuation-mission"][value="relay-sequence"]')).toBeChecked();
  await expect(page.locator('input[name="continuation-schedule"][value="in-1h-24h"]')).toBeChecked();

  await page.locator('[data-action="cancel-realm-continuation"]').click();
  await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-action="open-realm-continuation"]')).toBeFocused();
  const realm = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
  expect(realm.total).toBe(3);
  expect(realm.receipts).toHaveLength(1);
  expect(realm.missions).toBeUndefined();
  await context.close();
});

test('expired unconsumed invite is not restored and a fresh mission is issued', async ({ browser }) => {
  const ledger = savedRealmLedger();
  const expiredMissionId = 'mission_expired000000';
  ledger.realms[0].missions = [{
    id: expiredMissionId,
    missionId: 'route-choice',
    scheduleId: 'now-1h',
    createdAtMinute: Math.floor(Date.now() / 60_000) - 61,
    consumed: false,
  }];
  const context = await createContext(browser, { ledger, viewport: VIEWPORTS[1] });
  const page = await context.newPage();
  await page.goto('/');

  await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-action="open-realm-continuation"]')).toBeVisible();
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
  expect(before.total).toBe(3);
  expect(before.receipts).toHaveLength(1);
  expect(before.missions).toHaveLength(1);

  await page.locator('[data-action="open-realm-continuation"]').click();
  await page.locator('input[name="continuation-mission"][value="signal-match"]').check();
  await page.locator('input[name="continuation-schedule"][value="now-24h"]').check();
  await page.locator('[data-form="realm-continuation"]').evaluate(form => form.requestSubmit());
  await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'success');

  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
  expect(after.total).toBe(3);
  expect(after.receipts).toEqual(before.receipts);
  expect(after.missions).toHaveLength(2);
  expect(after.missions[0].id).toBe(expiredMissionId);
  expect(after.missions[0].consumed).toBe(false);
  expect(after.missions[1].id).not.toBe(expiredMissionId);
  expect(after.missions[1].missionId).toBe('signal-match');
  expect(after.missions[1].consumed).toBe(false);
  await context.close();
});

async function completeFollowerMission(page, missionId) {
  await page.locator('[data-role="builder"]').click();
  if (missionId === 'route-choice') {
    await page.locator('[data-mission-command="sky"]').click();
  } else if (missionId === 'relay-sequence') {
    for (const command of ['1', '2', '3']) await page.locator(`[data-mission-command="${command}"]`).click();
  } else {
    await page.locator('[data-mission-command="wave"]').click();
  }
  await expect(page.locator('[data-mission-result]')).toBeVisible();
}

test('seven sequential browser mission instances return exactly seven receipts and +21', async ({ browser }) => {
  const context = await createContext(browser, { ledger: savedRealmLedger({ total: 0 }), viewport: VIEWPORTS[1] });
  const page = await context.newPage();
  const missions = ['route-choice', 'relay-sequence', 'signal-match'];

  for (let index = 0; index < 7; index += 1) {
    const missionId = missions[index % missions.length];
    await page.goto('/');
    await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'ready');
    await page.locator('[data-action="open-realm-continuation"]').click();
    await page.locator(`input[name="continuation-mission"][value="${missionId}"]`).check();
    await page.locator('input[name="continuation-schedule"][value="now-1h"]').check();
    await page.locator('[data-form="realm-continuation"]').evaluate(form => form.requestSubmit());
    await expect(page.locator('[data-realm-continuation]')).toHaveAttribute('data-state', 'success');
    await page.locator('[data-action="share-realm-continuation"]').click();
    await expect.poll(() => page.evaluate(() => window.__cvClipboard)).toContain('#invite=');
    const inviteUrl = await page.evaluate(() => window.__cvClipboard);

    await page.goto(inviteUrl);
    await completeFollowerMission(page, missionId);
    await page.locator('[data-action="mission-result-action"]').click();
    await expect.poll(() => page.evaluate(() => window.__cvClipboard)).toContain('#receipt=');
    const receiptUrl = await page.evaluate(() => window.__cvClipboard);

    await page.goto(receiptUrl);
    await page.locator('[data-action="import-completion-receipt"]').click();
    await expect(page.locator('[data-completion-receipt-view]')).toBeVisible();
    const realm = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
    expect(realm.total).toBe((index + 1) * 3);
    expect(realm.receipts).toHaveLength(index + 1);
    expect(realm.missions).toHaveLength(index + 1);
    expect(realm.missions.filter(mission => mission.consumed)).toHaveLength(index + 1);
  }

  const finalRealm = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).realms[0], LEDGER_KEY);
  expect(finalRealm.total).toBe(21);
  expect(finalRealm.receipts).toHaveLength(7);
  expect(new Set(finalRealm.missions.map(mission => mission.id)).size).toBe(7);
  await context.close();
});
