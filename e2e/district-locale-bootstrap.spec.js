import { test, expect } from '@playwright/test';
import { createPrototypeInvite } from '../src/prototype-invite.js';

const TOKEN = createPrototypeInvite({
  name: 'Nova Guild',
  theme: 'cosmic',
  promise: 'Build the signal together.',
  missionId: 'route-choice',
});

test('restored Arabic district result keeps Arabic share payload before localization decorates the page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem('creatorverse-locale', 'ar');
    window.__districtClipboard = '';
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          window.__districtClipboard = String(value);
        },
      },
    });
  });

  const page = await context.newPage();
  await page.goto(`/#invite=${TOKEN}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.locator('[data-role="builder"]').click();
  await page.locator('[data-mission-command="sky"]').click();
  await expect(page.locator('[data-mission-result]')).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#mission-result-title')).toHaveText('تم فتح الحي');

  await page.locator('[data-action="mission-result-action"]').click();
  await expect(page.locator('[data-action="mission-result-action"]')).toContainText('تم النسخ');

  const payload = await page.evaluate(() => window.__districtClipboard);
  expect(payload).toContain('تم تعزيز الإشارة');
  expect(payload).toContain('حيّ المنارة');
  expect(payload).toContain('+3');
  expect(payload).not.toContain('Signal strengthened');
  expect(payload).not.toContain('Beacon District');

  await context.close();
});
