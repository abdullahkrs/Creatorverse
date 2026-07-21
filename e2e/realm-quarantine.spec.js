import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { createPrototypeInvite } from '../src/prototype-invite.js';

mkdirSync('test-results/realm-quarantine', { recursive: true });
test.setTimeout(120_000);

const STORAGE_KEY = 'creatorverse-realm-quarantine-v1';
const CREATED_MINUTE = Math.floor(Date.now() / 60_000);
const CREATED_MS = CREATED_MINUTE * 60_000;
const REALM_A = 'Realm_A000000000000001';
const REALM_B = 'Realm_B000000000000002';
const REALM_C = 'Realm_C000000000000003';
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function inviteFor(realmId, name = 'Harbor Guild') {
  return createPrototypeInvite({
    name,
    theme: 'cosmic',
    promise: 'Build one calm fictional signal.',
    missionId: 'route-choice',
    realmId,
    scheduleId: 'now-24h',
    createdAtMinute: CREATED_MINUTE,
  }, { now: CREATED_MS });
}

async function createContext(browser, locale, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ selectedLocale, storageKey }) => {
    if (!localStorage.getItem('creatorverse-locale')) {
      localStorage.setItem('creatorverse-locale', selectedLocale);
    }
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === storageKey && globalThis.__creatorverseFailQuarantineWrites) {
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    };
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { globalThis.__quarantineClipboard = String(value); } },
    });
  }, { selectedLocale: locale, storageKey: STORAGE_KEY });
  return context;
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
}

async function assertTargets(page, label) {
  const targets = await page.locator('.realm-quarantine-dialog :is(button, .realm-quarantine-reason):visible, [data-realm-quarantine-state] button:visible, [data-action="open-realm-safety"]:visible').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { name: node.textContent?.trim() || node.getAttribute('aria-label') || '', width: rect.width, height: rect.height };
  }));
  for (const target of targets) {
    expect(target.width, `${label} ${target.name} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${label} ${target.name} height`).toBeGreaterThanOrEqual(44);
  }
}

async function assertAxe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function capture(page, locale, viewport, state) {
  await page.screenshot({
    path: `test-results/realm-quarantine/${locale}-${viewport.width}x${viewport.height}-${state}.png`,
    fullPage: true,
  });
}

async function openSafety(page, keyboard = false) {
  const trigger = page.locator('[data-action="open-realm-safety"]');
  await expect(trigger).toBeVisible();
  if (keyboard) {
    await trigger.focus();
    await trigger.press('Enter');
  } else {
    await trigger.click();
  }
  await expect(page.locator('[data-realm-quarantine-dialog="hide"]')).toBeVisible();
  await expect(page.locator('#realm-quarantine-dialog-title')).toBeFocused();
}

async function chooseReason(page, value = 'unsafe-real-world') {
  await page.locator(`input[name="realm-quarantine-reason"][value="${value}"]`).check();
  await expect(page.locator('[data-action="confirm-realm-quarantine"]')).toBeEnabled();
}

async function confirmHide(page) {
  await page.locator('[data-action="confirm-realm-quarantine"]').click();
  await expect(page.locator('[data-realm-quarantine-state]')).toBeVisible();
}

async function restoreRealm(page) {
  await page.locator('[data-action="show-realm-again"]').click();
  await expect(page.locator('[data-realm-quarantine-dialog="restore"]')).toBeVisible();
  await expect(page.locator('#realm-restore-dialog-title')).toBeFocused();
  await page.locator('[data-action="confirm-realm-restore"]').click();
  await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'restored');
}

async function switchLocale(page, targetLocale) {
  await Promise.all([
    page.waitForEvent('load'),
    page.locator(`[data-locale="${targetLocale}"]`).click(),
  ]);
  await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
}

async function returnHome(page) {
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('[data-action="quarantine-return-home"]').click(),
  ]);
  await expect(page).not.toHaveURL(/#invite=/u);
}

async function openFreshInvite(page, token) {
  await page.goto(`/#invite=${token}`);
  await page.reload();
}

async function expectInvitedContentAbsent(page) {
  await expect(page.locator('[data-prototype-follower-entry]')).toHaveCount(0);
  await expect(page.locator('[data-mission-result]')).toHaveCount(0);
  await expect(page.locator('[data-completion-receipt]')).toHaveCount(0);
  await expect(page.locator('.signal-contribution')).toHaveCount(0);
  await expect(page.locator('[data-role]')).toHaveCount(0);
}

for (const locale of ['en', 'ar']) {
  test(`${locale} quarantine flow remains exact, private, reversible, and navigation safe`, async ({ browser }) => {
    const tokenA = inviteFor(REALM_A);
    const tokenB = inviteFor(REALM_B, 'Canopy Relay');
    const context = await createContext(browser, locale, { width: 390, height: 844 });
    const page = await context.newPage();
    await page.goto(`/#invite=${tokenA}`);

    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('[data-prototype-follower-entry]')).toContainText('Harbor Guild');

    const trigger = page.locator('[data-action="open-realm-safety"]');
    await trigger.focus();
    await trigger.press('Enter');
    await expect(page.locator('[data-action="confirm-realm-quarantine"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-realm-quarantine-dialog]')).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await openSafety(page, true);
    await chooseReason(page, 'harassment-hateful');
    await page.evaluate(() => {
      const native = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 60);
      window.__restoreQuarantineRaf = () => { window.requestAnimationFrame = native; };
    });
    await page.locator('[data-action="confirm-realm-quarantine"]').click({ noWaitAfter: true });
    await expect(page.locator('[data-action="confirm-realm-quarantine"]')).toBeDisabled();
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
    await page.evaluate(() => window.__restoreQuarantineRaf?.());
    await expect(page.locator('#realm-quarantine-state-title')).toBeFocused();
    await expect(page).not.toHaveURL(/#invite=/u);
    await expectInvitedContentAbsent(page);

    const stored = await page.evaluate(storageKey => localStorage.getItem(storageKey), STORAGE_KEY);
    expect(stored).not.toContain(tokenA);
    expect(stored).not.toContain('Harbor Guild');
    const parsedStored = JSON.parse(stored);
    expect(Object.keys(parsedStored).sort()).toEqual(['records', 'v']);
    expect(Object.keys(parsedStored.records[0]).sort()).toEqual(['q', 'r', 'v']);
    expect(parsedStored.records[0]).toEqual({ v: 1, r: REALM_A, q: 'harassment-hateful' });

    await page.reload();
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
    await expectInvitedContentAbsent(page);

    await page.evaluate(token => { window.location.hash = `invite=${token}`; }, tokenA);
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
    await expect(page).not.toHaveURL(/#invite=/u);
    await expectInvitedContentAbsent(page);
    await page.goBack();
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');

    const otherLocale = locale === 'ar' ? 'en' : 'ar';
    await switchLocale(page, otherLocale);
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
    await switchLocale(page, locale);
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');

    await openFreshInvite(page, tokenB);
    await expect(page.locator('[data-prototype-follower-entry]')).toContainText('Canopy Relay');
    await expect(page.locator('[data-action="open-realm-safety"]')).toBeVisible();

    await openFreshInvite(page, tokenA);
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
    await page.evaluate(({ storageKey, otherRealm }) => {
      const value = JSON.parse(localStorage.getItem(storageKey));
      value.records.push({ v: 1, r: otherRealm, q: 'personal-private-information' });
      localStorage.setItem(storageKey, JSON.stringify(value));
    }, { storageKey: STORAGE_KEY, otherRealm: REALM_C });

    await restoreRealm(page);
    const afterRestore = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), STORAGE_KEY);
    expect(afterRestore.records).toEqual([{ v: 1, r: REALM_C, q: 'personal-private-information' }]);
    await returnHome(page);
    await openFreshInvite(page, tokenA);
    await expect(page.locator('[data-prototype-follower-entry]')).toContainText('Harbor Guild');
    await expect(page.locator('[data-mission-result]')).toHaveCount(0);

    await context.close();
  });

  test(`${locale} malformed quarantine values are rejected without reflection`, async ({ browser }) => {
    const context = await createContext(browser, locale, { width: 390, height: 844 });
    await context.addInitScript(({ storageKey, realmId }) => {
      localStorage.setItem(storageKey, JSON.stringify({
        v: 1,
        records: [
          { v: 1, r: realmId, q: 'unsafe-real-world', unknown: '<script>raw-secret</script>' },
          { v: 1, r: realmId, q: 'unsafe-real-world' },
        ],
      }));
    }, { storageKey: STORAGE_KEY, realmId: REALM_A });
    const page = await context.newPage();
    await page.goto(`/#invite=${inviteFor(REALM_A)}`);
    await expect(page.locator('body')).not.toContainText('raw-secret');
    await expect(page.locator('body')).not.toContainText('<script>');
    await expect(page.locator('[data-action="open-realm-safety"]')).toBeVisible();
    await expect(page.locator('[data-realm-quarantine-state]')).toHaveCount(0);
    await context.close();
  });

  for (const [index, viewport] of VIEWPORTS.entries()) {
    test(`${locale} quarantine evidence at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const token = inviteFor(REALM_A);
      const context = await createContext(browser, locale, viewport);
      const page = await context.newPage();
      await page.goto(`/#invite=${token}`);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

      await openSafety(page, index % 2 === 0);
      await expect(page.locator('[data-action="confirm-realm-quarantine"]')).toBeDisabled();
      await assertTargets(page, `${locale} ${viewport.width} choice`);
      await assertNoOverflow(page, `${locale} ${viewport.width} choice`);
      await capture(page, locale, viewport, 'choice');
      if (viewport.width === 390) await assertAxe(page, `${locale} choice`);

      await chooseReason(page, 'unsafe-real-world');
      await confirmHide(page);
      await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');
      await expectInvitedContentAbsent(page);
      await assertTargets(page, `${locale} ${viewport.width} hidden`);
      await assertNoOverflow(page, `${locale} ${viewport.width} hidden`);
      await capture(page, locale, viewport, 'hidden');
      if (viewport.width === 390) await assertAxe(page, `${locale} hidden`);

      await restoreRealm(page);
      await returnHome(page);
      await openFreshInvite(page, token);
      await page.evaluate(() => { globalThis.__creatorverseFailQuarantineWrites = true; });
      await openSafety(page);
      await chooseReason(page, 'personal-private-information');
      await confirmHide(page);
      await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'error');
      await expect(page.locator('[data-action="retry-realm-quarantine"]')).toBeVisible();
      await expectInvitedContentAbsent(page);
      await assertTargets(page, `${locale} ${viewport.width} error`);
      await assertNoOverflow(page, `${locale} ${viewport.width} error`);
      await capture(page, locale, viewport, 'error');
      if (viewport.width === 390) await assertAxe(page, `${locale} error`);

      await page.reload();
      await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'error');
      await page.evaluate(() => { globalThis.__creatorverseFailQuarantineWrites = false; });
      await page.locator('[data-action="retry-realm-quarantine"]').click();
      await expect(page.locator('[data-realm-quarantine-state]')).toHaveAttribute('data-state', 'hidden');

      if (viewport.width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await assertNoOverflow(page, `${locale} 200% zoom`);
        await expect(page.locator('[data-action="quarantine-return-home"]')).toBeVisible();
      }

      await context.close();
    });
  }
}
