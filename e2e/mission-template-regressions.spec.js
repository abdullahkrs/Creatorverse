import { test, expect } from '@playwright/test';

async function installClipboard(context) {
  await context.addInitScript(() => {
    localStorage.setItem('creatorverse-locale', 'en');
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
  });
}

test('route-choice preserves the selected ocean route through legacy completion', async ({ browser }) => {
  const creatorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installClipboard(creatorContext);
  const creator = await creatorContext.newPage();

  await creator.goto('/');
  await creator.locator('[data-action="creator"]').click();
  await creator.locator('[data-action="creator-next"]').click();
  await creator.locator('[data-action="creator-next"]').click();
  await creator.locator('input[name="mission-template"][value="route-choice"]').check();
  await creator.locator('[data-action="creator-next"]').click();
  await creator.locator('[data-action="copy-prototype-invite"]').click();
  const invite = await creator.evaluate(() => window.__missionRegressionClipboard);
  expect(invite).toContain('#invite=v1.');
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

test('malformed invite remains available to the existing explicit recovery UI', async ({ page }) => {
  await page.goto('/#invite=v1.invalid!');

  await expect(page.locator('[data-prototype-invite-error]')).toBeVisible();
  await expect(page.locator('#invite-error-title')).toBeFocused();
  await expect(page).toHaveURL(/#invite=v1\.invalid!/u);
  await expect(page.locator('body')).not.toContainText('v1.invalid!');
});
