import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const locale of ['en', 'ar']) {
  test(`${locale} primary flow has no serious accessibility violations`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('creatorverse-locale', value), locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const blocking = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test('creator safety error is announced and focus returns to the checkbox', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create realm/i }).click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-action="creator-next"]').click();
  const checkbox = page.locator('[data-field="safety"]');
  await checkbox.uncheck();
  await page.locator('[data-action="creator-next"]').click();
  await expect(checkbox).toBeFocused();
  await expect(checkbox).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.creator-studio .form-message')).not.toBeEmpty();
});
