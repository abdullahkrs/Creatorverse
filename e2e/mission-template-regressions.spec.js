import { test, expect } from '@playwright/test';

async function installClipboard(context, locale = 'en') {
  await context.addInitScript(initialLocale => {
    if (!localStorage.getItem('creatorverse-locale')) {
      localStorage.setItem('creatorverse-locale', initialLocale);
    }
    window.__missionRegressionClipboard = '';
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          window.__missionRegressionClipboard = String(value);
        },
      },
    });
  }, locale);
}

async function createInvite(page, templateId) {
  await page.goto('/');
  await page.locator('[data-action="creator"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator(`input[name="mission-template"][value="${templateId}"]`).check();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-action="copy-prototype-invite"]').click();
  const invite = await page.evaluate(() => window.__missionRegressionClipboard);
  expect(invite).toContain('#invite=v1.');
  return invite;
}

test('route-choice preserves the selected ocean route through legacy completion', async ({ browser }) => {
  const creatorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installClipboard(creatorContext);
  const creator = await creatorContext.newPage();
  const invite = await createInvite(creator, 'route-choice');
  await creatorContext.close();

  const followerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installClipboard(followerContext);
  const follower = await followerContext.newPage();
  await follower.goto(invite);
  await follower.locator('[data-role="builder"]').click();
  await follower.evaluate(() => {
    window.__completedLegacyRoute = '';
    document.addEventListener('click', event => {
      const route = event.target.closest?.('[data-mission-legacy-triggers] [data-route]');
      if (route) window.__completedLegacyRoute = route.dataset.route;
    }, true);
  });

  await follower.locator('[data-mission-command="ocean"]').click();
  await expect(follower.locator('[data-mission-result]')).toBeVisible();
  await expect.poll(() => follower.evaluate(() => window.__completedLegacyRoute)).toBe('ocean');
  await followerContext.close();
});

test('relay template and partial progress survive an English to Arabic switch', async ({ browser }) => {
  const creatorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installClipboard(creatorContext);
  const creator = await creatorContext.newPage();
  const invite = await createInvite(creator, 'relay-sequence');
  await creatorContext.close();

  const followerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installClipboard(followerContext);
  const follower = await followerContext.newPage();
  await follower.goto(invite);
  await follower.locator('[data-role="builder"]').click();
  await follower.locator('[data-mission-command="1"]').click();
  await expect(follower.locator('[data-mission-command="2"]')).toBeEnabled();

  await Promise.all([
    follower.waitForEvent('load'),
    follower.locator('[data-locale="ar"]').click(),
  ]);

  await expect(follower.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(follower.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(follower.locator('[data-role="builder"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(follower.locator('.mission')).toHaveAttribute('data-mission-template', 'relay-sequence');
  await expect(follower.locator('#mission-title')).toContainText('اربط المرحّلات');
  await expect(follower.locator('[data-mission-command="1"]')).toBeDisabled();
  await expect(follower.locator('[data-mission-command="2"]')).toBeEnabled();
  await expect(follower.locator('[data-mission-result]')).toHaveCount(0);
  await followerContext.close();
});

test('malformed invite remains available to the existing explicit recovery UI', async ({ page }) => {
  await page.goto('/#invite=v1.invalid!');

  await expect(page.locator('[data-prototype-invite-error]')).toBeVisible();
  await expect(page.locator('#invite-error-title')).toBeFocused();
  await expect(page).toHaveURL(/#invite=v1\.invalid!/u);
  await expect(page.locator('body')).not.toContainText('v1.invalid!');
});

test('unknown hidden payload fields fail closed without reflection', async ({ page }) => {
  const token = `v1.${Buffer.from(JSON.stringify({
    v: 1,
    n: 'Canopy Works',
    t: 'wild',
    creator: '@private',
    extra: '<script>alert(1)</script>',
  })).toString('base64url')}`;

  await page.goto(`/#invite=${token}`);
  await expect(page.locator('[data-prototype-invite-error]')).toBeVisible();
  await expect(page.locator('#invite-error-title')).toBeFocused();
  await expect(page.locator('body')).not.toContainText('@private');
  await expect(page.locator('body')).not.toContainText('<script>');

  await page.locator('[data-action="open-featured-realm"]').click();
  await expect(page.locator('.mission')).toHaveAttribute('data-mission-template', 'route-choice');
});