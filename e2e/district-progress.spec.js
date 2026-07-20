import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createPrototypeInvite } from '../src/prototype-invite.js';

mkdirSync('test-results/district-progress', { recursive: true });

test.setTimeout(90_000);

const TOKEN = createPrototypeInvite({
  name: 'Nova Guild',
  theme: 'cosmic',
  promise: 'Build the signal together.',
  missionId: 'route-choice',
});
const INVITE_URL = `/#invite=${TOKEN}`;
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
    district: 'Beacon District',
    legacyDistrict: 'Signal Harbor',
    lockedValue: '0 / 3',
    unlockedValue: '3 / 3',
    title: 'District unlocked',
    copied: 'Copied',
  },
  {
    id: 'ar',
    dir: 'rtl',
    district: 'حيّ المنارة',
    legacyDistrict: 'ميناء الإشارة',
    lockedValue: '٠ / ٣',
    unlockedValue: '٣ / ٣',
    title: 'تم فتح الحي',
    copied: 'تم النسخ',
  },
];

async function newContext(browser, locale, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
  await context.addInitScript(localeId => {
    localStorage.setItem('creatorverse-locale', localeId);
    window.__districtClipboard = '';
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__districtClipboard = String(value); } },
    });
  }, locale.id);
  return context;
}

async function expectQuality(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);

  const action = page.locator('[data-action="mission-result-action"]:visible');
  if (await action.count()) {
    const box = await action.boundingBox();
    expect(box?.width || 0).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  }

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function capture(page, locale, viewport, state) {
  await page.screenshot({
    path: `test-results/district-progress/${locale.id}-${viewport.width}x${viewport.height}-${state}.png`,
    fullPage: true,
  });
}

async function expectRealmDistrict(page, locale, unlocked) {
  const card = page.locator('.realm-card');
  const progress = card.locator('.progress');
  await expect(card).toHaveAttribute('data-district-state', unlocked ? 'unlocked' : 'locked');
  await expect(card.locator('.progress-label span')).toHaveText(locale.district);
  await expect(card.locator('.progress-label strong')).toHaveText(unlocked ? locale.unlockedValue : locale.lockedValue);
  await expect(progress).toHaveAttribute('aria-valuemax', '3');
  await expect(progress).toHaveAttribute('aria-valuenow', unlocked ? '3' : '0');
  await expect(card).not.toContainText(locale.legacyDistrict);
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`${locale.id} ${viewport.width} shows one locked district then one share-ready unlock`, async ({ browser }) => {
      const context = await newContext(browser, locale, viewport);
      const page = await context.newPage();
      await page.goto(INVITE_URL);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.id);
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);

      const locked = page.locator('[data-district-progress]');
      await expect(locked).toHaveCount(1);
      await expect(locked).toHaveAttribute('data-district-state', 'locked');
      await expect(locked).toHaveAttribute('aria-valuenow', '0');
      await expect(locked).toContainText(locale.district);
      await expectRealmDistrict(page, locale, false);
      await expectQuality(page, `${locale.id} ${viewport.width} locked`);
      await capture(page, locale, viewport, 'locked');

      await page.locator('[data-role="builder"]').click();
      await page.locator('[data-mission-command="sky"]').click();

      const result = page.locator('[data-mission-result]');
      await expect(result).toBeVisible();
      await expect(result.locator('[data-district-progress]')).toHaveCount(1);
      await expect(result.locator('[data-district-progress]')).toHaveAttribute('data-district-state', 'unlocked');
      await expect(result.locator('[data-district-progress]')).toHaveAttribute('aria-valuenow', '3');
      await expect(result.locator('#mission-result-title')).toHaveText(locale.title);
      await expect(result).toContainText(locale.district);
      await expect(result).toContainText('+3');
      await expect(result.locator('#mission-result-title')).toBeFocused();
      await expect(page.locator('[data-role]:disabled')).toHaveCount(3);
      await expectRealmDistrict(page, locale, true);
      await expectQuality(page, `${locale.id} ${viewport.width} unlocked`);
      await capture(page, locale, viewport, 'unlocked');

      await page.locator('[data-action="mission-result-action"]').click();
      await expect(page.locator('[data-action="mission-result-action"]')).toContainText(locale.copied);
      const shared = await page.evaluate(() => window.__districtClipboard);
      expect(shared).toContain(locale.district);
      expect(shared).toContain('+3');
      await capture(page, locale, viewport, 'share-ready');

      const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('creatorverse-district-progress')));
      expect(stored).toMatchObject({ districtId: 'beacon-district', unlocked: true, contribution: 3 });
      await context.close();
    });
  }
}

test('refresh and both locale directions restore the static result without replaying contribution', async ({ browser }) => {
  const context = await newContext(browser, LOCALES[0], VIEWPORTS[1]);
  const page = await context.newPage();
  await page.goto(INVITE_URL);
  await page.locator('[data-role="builder"]').click();
  await page.locator('[data-mission-command="sky"]').click();
  await expect(page.locator('[data-mission-result]')).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-mission-result]')).toBeVisible();
  await expect(page.locator('[data-district-progress]')).toHaveClass(/is-restored/u);
  await expect(page.locator('[data-result-announcement]')).toBeEmpty();
  await expect(page.locator('[data-district-progress]')).toHaveAttribute('aria-valuenow', '3');
  await expectRealmDistrict(page, LOCALES[0], true);
  expect(await page.locator('[data-district-progress]').count()).toBe(1);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('[data-locale="ar"]').click(),
  ]);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#mission-result-title')).toHaveText('تم فتح الحي');
  await expect(page.locator('#mission-result-title')).toBeFocused();
  await expect(page.locator('[data-district-progress]')).toHaveAttribute('aria-valuenow', '3');
  await expectRealmDistrict(page, LOCALES[1], true);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('[data-locale="en"]').click(),
  ]);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('#mission-result-title')).toHaveText('District unlocked');
  await expect(page.locator('#mission-result-title')).toBeFocused();
  await expectRealmDistrict(page, LOCALES[0], true);

  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('creatorverse-district-progress')));
  expect(stored.contribution).toBe(3);
  await context.close();
});

test('fresh context and malformed invite fail closed to locked 0 / 3', async ({ browser }) => {
  const first = await newContext(browser, LOCALES[0], VIEWPORTS[0]);
  const completedPage = await first.newPage();
  await completedPage.goto(INVITE_URL);
  await completedPage.locator('[data-role="builder"]').click();
  await completedPage.locator('[data-mission-command="sky"]').click();
  await expect(completedPage.locator('[data-mission-result]')).toBeVisible();

  await completedPage.goto('/#invite=broken');
  await expect(completedPage.locator('[data-mission-result]')).toHaveCount(0);
  await expect(completedPage.locator('[data-prototype-invite-error]')).toBeVisible();
  await expect(completedPage.locator('#invite-error-title')).toBeFocused();
  expect(await completedPage.evaluate(() => sessionStorage.getItem('creatorverse-district-progress'))).toBeNull();

  await Promise.all([
    completedPage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    completedPage.locator('[data-action="open-featured-realm"]').click(),
  ]);
  await expect(completedPage).not.toHaveURL(/#invite=/u);
  await expect(completedPage.locator('[data-mission-result]')).toHaveCount(0);
  await expect(completedPage.locator('[data-district-progress]')).toHaveAttribute('data-district-state', 'locked');
  await expect(completedPage.locator('[data-district-progress]')).toHaveAttribute('aria-valuenow', '0');
  await first.close();

  const fresh = await newContext(browser, LOCALES[0], VIEWPORTS[0]);
  const freshPage = await fresh.newPage();
  await freshPage.goto(INVITE_URL);
  await expect(freshPage.locator('[data-mission-result]')).toHaveCount(0);
  await expect(freshPage.locator('[data-district-progress]')).toHaveAttribute('data-district-state', 'locked');
  await expect(freshPage.locator('[data-district-progress]')).toHaveAttribute('aria-valuenow', '0');
  await expectRealmDistrict(freshPage, LOCALES[0], false);
  await fresh.close();
});

test('200% text zoom and reduced motion preserve the unlocked state without overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: VIEWPORTS[0], reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('creatorverse-locale', 'ar');
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
  });
  const page = await context.newPage();
  await page.goto(INVITE_URL);
  await page.locator('[data-role="builder"]').click();
  await page.locator('[data-mission-command="sky"]').click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.locator('[data-mission-result]')).toBeVisible();
  await expectRealmDistrict(page, LOCALES[1], true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const animations = await page.locator('[data-district-progress]').evaluate(node => node.getAnimations().length);
  expect(animations).toBe(0);
  await context.close();
});
