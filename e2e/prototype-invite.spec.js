import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

async function setLocale(context, locale) {
  await context.addInitScript(selectedLocale => {
    localStorage.setItem('creatorverse-locale', selectedLocale);
  }, locale);
}

async function installClipboard(context, mode = 'success') {
  await context.addInitScript(copyMode => {
    window.__copiedPrototypeInvite = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          if (copyMode === 'denied') throw new DOMException('Denied', 'NotAllowedError');
          if (copyMode === 'failed') throw new Error('Clipboard failure');
          window.__copiedPrototypeInvite = value;
        },
      },
    });
  }, mode);
}

async function completeCreatorOnboarding(page) {
  await page.goto('/');
  await page.locator('[data-action="creator"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await expect(page.locator('[data-prototype-invite-receipt]')).toBeVisible();
  await expect(page.locator('[data-action="copy-prototype-invite"]')).toBeFocused();
}

async function assertNoPageOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

for (const locale of ['en', 'ar']) {
  for (const viewport of viewports) {
    test(`${locale} prototype invite path at ${viewport.width}x${viewport.height}`, async ({ browser }, testInfo) => {
      const creatorContext = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await setLocale(creatorContext, locale);
      await installClipboard(creatorContext);
      const creatorPage = await creatorContext.newPage();
      await completeCreatorOnboarding(creatorPage);

      const receipt = creatorPage.locator('[data-prototype-invite-receipt]');
      await expect(receipt.locator('h2')).toContainText(locale === 'ar' ? 'دعوتك' : 'invite');
      await expect(receipt).not.toContainText('@creator');
      await assertNoPageOverflow(creatorPage);
      await creatorPage.screenshot({
        path: testInfo.outputPath(`${locale}-${viewport.width}-creator-receipt.png`),
        fullPage: true,
      });

      if (viewport.width <= 390) {
        await creatorPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await assertNoPageOverflow(creatorPage);
        await creatorPage.screenshot({
          path: testInfo.outputPath(`${locale}-${viewport.width}-creator-receipt-zoom-200.png`),
          fullPage: true,
        });
        await creatorPage.evaluate(() => { document.documentElement.style.fontSize = ''; });
      }

      await creatorPage.locator('[data-action="copy-prototype-invite"]').click();
      await expect(creatorPage.locator('[data-action="copy-prototype-invite"]')).toContainText(locale === 'ar' ? 'تم النسخ' : 'Copied');
      const inviteUrl = await creatorPage.evaluate(() => window.__copiedPrototypeInvite);
      expect(inviteUrl).toContain('#invite=v1.');
      expect(inviteUrl).not.toContain('?');
      expect(inviteUrl).not.toContain('@creator');

      const followerContext = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await setLocale(followerContext, locale);
      const followerPage = await followerContext.newPage();
      await followerPage.goto(inviteUrl);
      await expect(followerPage.locator('[data-prototype-follower-entry]')).toBeVisible();
      await expect(followerPage.locator('.nav-create')).toBeHidden();
      await expect(followerPage.locator('.creator-tools')).toBeHidden();
      await expect(followerPage.locator('[data-role]')).toHaveCount(3);
      await expect(followerPage.locator('body')).not.toContainText('@creator');
      await assertNoPageOverflow(followerPage);
      await followerPage.screenshot({
        path: testInfo.outputPath(`${locale}-${viewport.width}-follower-entry.png`),
        fullPage: true,
      });

      const firstRole = followerPage.locator('[data-role]').first();
      await firstRole.focus();
      await firstRole.press('Enter');
      await expect(firstRole).toHaveAttribute('aria-pressed', 'true');
      await followerPage.screenshot({
        path: testInfo.outputPath(`${locale}-${viewport.width}-role-ready.png`),
        fullPage: true,
      });

      const firstRoute = followerPage.locator('[data-route]').first();
      await firstRoute.focus();
      await firstRoute.press('Enter');
      await expect(followerPage.locator('[data-mission-result]')).toBeVisible();
      await expect(followerPage.locator('.nav-create')).toBeVisible();
      await followerPage.screenshot({
        path: testInfo.outputPath(`${locale}-${viewport.width}-result-ready.png`),
        fullPage: true,
      });

      if (viewport.width <= 390) {
        await followerPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await assertNoPageOverflow(followerPage);
        await followerPage.screenshot({
          path: testInfo.outputPath(`${locale}-${viewport.width}-result-ready-zoom-200.png`),
          fullPage: true,
        });
      }

      const invalidContext = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await setLocale(invalidContext, locale);
      const invalidPage = await invalidContext.newPage();
      const baseUrl = new URL(inviteUrl);
      await invalidPage.goto(`${baseUrl.origin}${baseUrl.pathname}#invite=v1.invalid!`);
      await expect(invalidPage.locator('[data-prototype-invite-error]')).toBeVisible();
      await expect(invalidPage.locator('#invite-error-title')).toBeFocused();
      await expect(invalidPage.locator('body')).not.toContainText('v1.invalid');
      await assertNoPageOverflow(invalidPage);
      await invalidPage.screenshot({
        path: testInfo.outputPath(`${locale}-${viewport.width}-invalid-recovery.png`),
        fullPage: true,
      });

      if (viewport.width === 390) {
        for (const page of [creatorPage, followerPage, invalidPage]) {
          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))).toEqual([]);
        }
      }

      await creatorContext.close();
      await followerContext.close();
      await invalidContext.close();
    });
  }
}

test('copy denial reveals a selected safe URL and retry succeeds', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setLocale(context, 'en');
  await installClipboard(context, 'denied');
  const page = await context.newPage();
  await completeCreatorOnboarding(page);
  await page.locator('[data-action="copy-prototype-invite"]').click();

  const manual = page.locator('[data-invite-manual-url]');
  await expect(manual).toBeVisible();
  await expect(manual).toHaveAttribute('readonly', '');
  await expect(manual).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('[data-action="copy-prototype-invite"]')).toBeFocused();
  expect(await manual.inputValue()).toContain('#invite=v1.');
  await context.close();
});

test('invalid invite recovery opens the normal featured realm', async ({ page }) => {
  await page.goto('/#invite=v1.invalid!');
  await page.locator('[data-action="open-featured-realm"]').click();
  await expect(page).not.toHaveURL(/#invite=/u);
  await expect(page.locator('[data-role]')).toHaveCount(3);
  await expect(page.locator('[data-prototype-invite-error]')).toHaveCount(0);
});
