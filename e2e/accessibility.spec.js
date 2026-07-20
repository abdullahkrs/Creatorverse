import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { getMissionResultCopy } from '../src/mission-result-i18n.js';

const localeDirection = { en: 'ltr', ar: 'rtl' };

async function setInitialLocale(page, locale) {
  await page.addInitScript(value => {
    if (!localStorage.getItem('creatorverse-locale')) localStorage.setItem('creatorverse-locale', value);
  }, locale);
}

async function completeMission(page, { role = 'builder', route = 'sky' } = {}) {
  await page.locator(`[data-role="${role}"]`).click();
  await page.locator(`[data-route="${route}"]`).click();
  await expect(page.locator('[data-mission-result]')).toBeVisible();
}

async function expectNoBlockingAxeViolations(page, context) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(blocking, `${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

for (const locale of ['en', 'ar']) {
  test(`${locale} primary path and completed result pass axe`, async ({ page }) => {
    await setInitialLocale(page, locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('dir', localeDirection[locale]);
    await expectNoBlockingAxeViolations(page, `${locale} role-ready`);

    await completeMission(page);
    await expect(page.locator('.signal-result-facts')).toBeVisible();
    await expect(page.locator('[data-action="mission-result-action"]')).toBeVisible();
    await expect(page.locator('#mission-result-action-status')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[data-result-announcement]')).toHaveAttribute('aria-live', 'polite');
    await expectNoBlockingAxeViolations(page, `${locale} result-ready`);
  });

  test(`${locale} language switch preserves result and passes axe`, async ({ page }) => {
    const targetLocale = locale === 'en' ? 'ar' : 'en';
    await setInitialLocale(page, locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await completeMission(page, { role: 'guardian', route: 'ocean' });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator(`[data-locale="${targetLocale}"]`).click(),
    ]);

    await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
    await expect(page.locator('html')).toHaveAttribute('dir', localeDirection[targetLocale]);
    await expect(page.locator('[data-role="guardian"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-mission-result]')).toBeVisible();
    await expectNoBlockingAxeViolations(page, `${locale} to ${targetLocale} result`);
  });

  test(`${locale} controlled action error and retry pass axe`, async ({ page }) => {
    const copy = getMissionResultCopy(locale);
    await setInitialLocale(page, locale);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: () => new Promise((resolve, reject) => {
          window.__a11yShareAttempt = (window.__a11yShareAttempt || 0) + 1;
          window.__settleA11yShare = window.__a11yShareAttempt === 1
            ? () => reject(new Error('CONTROLLED_SHARE_FAILURE'))
            : () => resolve();
        }),
      });
    });
    await page.goto('/');
    await completeMission(page);

    const action = page.locator('[data-action="mission-result-action"]');
    const status = page.locator('#mission-result-action-status');
    await action.click();
    await expect(action).toBeDisabled();
    await page.evaluate(() => window.__settleA11yShare());
    await expect(status).toHaveText(copy.shareFailed);
    await expect(status).toBeVisible();
    await expect(action).toBeFocused();
    await expectNoBlockingAxeViolations(page, `${locale} action error`);

    await action.click();
    await expect(action).toBeDisabled();
    await page.evaluate(() => window.__settleA11yShare());
    await expect(action).toContainText(copy.shared);
    await expect(status).toHaveText(copy.shareSuccess);
    await expectNoBlockingAxeViolations(page, `${locale} action success`);
  });

  test(`${locale} creator safety error is announced and passes axe`, async ({ page }) => {
    await setInitialLocale(page, locale);
    await page.goto('/');
    await page.locator('[data-action="creator"]').click();
    await page.locator('[data-action="creator-next"]').click();
    await page.locator('[data-action="creator-next"]').click();
    await page.locator('input[name="mission-template"][value="route-choice"]').check();
    const checkbox = page.locator('[data-field="safety"]');
    await checkbox.uncheck();
    await page.locator('[data-action="creator-next"]').click();

    await expect(checkbox).toBeFocused();
    await expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.creator-studio .form-message')).not.toBeEmpty();
    await expectNoBlockingAxeViolations(page, `${locale} creator safety error`);
  });
}
