import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

mkdirSync('test-results/screenshots', { recursive: true });

const viewports = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
];

for (const locale of ['en', 'ar']) {
  for (const viewport of viewports) {
    test(`${locale} ${viewport.name} keeps the core loop usable`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(value => localStorage.setItem('creatorverse-locale', value), locale);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('[data-role]').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const targets = await page.locator('button:visible').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
      expect(Math.min(...targets)).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/screenshots/${locale}-${viewport.name}.png`, fullPage: true });
    });
  }
}

test('keyboard mission result flow remains predictable', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-role="builder"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-route="sky"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-mission-result]')).toBeVisible();
  await expect(page.getByRole('button', { name: /share result|copy result/i })).toBeVisible();
});

test('reduced motion disables purposeful progress animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.locator('.progress span').evaluate(node => getComputedStyle(node).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
});
