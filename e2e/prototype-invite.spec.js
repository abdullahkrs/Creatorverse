import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const FIXTURES = {
  en: {
    realmName: 'Lumen Guild',
    promise: 'A fictional community building safe routes together.',
  },
  ar: {
    realmName: 'عالم لومن',
    promise: 'مجتمع خيالي يبني مسارات آمنة معًا.',
  },
};

async function createLocalizedPage(browser, baseURL, locale, clipboardMode = 'deferred') {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(({ selectedLocale, mode }) => {
    localStorage.setItem('creatorverse-locale', selectedLocale);
    window.__copiedInvite = '';
    window.__resolveInviteCopy = null;
    window.__copyShouldFail = mode === 'failure';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(value) {
          if (window.__copyShouldFail) {
            return Promise.reject(new DOMException('Denied for controlled test', 'NotAllowedError'));
          }
          window.__copiedInvite = value;
          if (mode === 'deferred') {
            return new Promise(resolve => { window.__resolveInviteCopy = resolve; });
          }
          return Promise.resolve();
        },
      },
    });
  }, { selectedLocale: locale, mode: clipboardMode });
  const page = await context.newPage();
  return { context, page };
}

async function assertNoHorizontalOverflow(page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

async function expectMinimumTarget(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

async function captureState(page, testInfo, locale, state) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${locale}-${state}-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
}

async function validateTextZoom(page, selector) {
  for (const viewport of VIEWPORTS.slice(0, 2)) {
    await page.setViewportSize(viewport);
    const style = await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await expect(page.locator(selector)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await style.evaluate(node => node.remove());
  }
}

async function expectNoSeriousAxeViolations(page) {
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations.filter(violation => ['critical', 'serious'].includes(violation.impact));
  expect(blocking).toEqual([]);
}

async function completeCreatorOnboarding(page, locale, testInfo) {
  const fixture = FIXTURES[locale];
  await page.goto('/');
  await page.locator('[data-action="creator"]').click();
  await page.locator('[data-field="name"]').fill(fixture.realmName);
  await page.locator('[data-field="tagline"]').fill(fixture.promise);
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-theme="future"]').click();
  await page.locator('[data-action="creator-next"]').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath(`${locale}-before-final-onboarding-390x844.png`),
    fullPage: true,
  });

  await page.locator('[data-action="creator-next"]').click();
  const receipt = page.locator('[data-prototype-invite-receipt]');
  await expect(receipt).toBeVisible();
  const copyButton = page.locator('[data-invite-action="copy"]');
  await expect(copyButton).toBeFocused();
  await expectMinimumTarget(copyButton);
  return copyButton;
}

for (const locale of ['en', 'ar']) {
  test(`prototype invite evidence matrix in ${locale}`, async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const creator = await createLocalizedPage(browser, baseURL, locale, 'deferred');
    const copyButton = await completeCreatorOnboarding(creator.page, locale, testInfo);

    await captureState(creator.page, testInfo, locale, 'creator-receipt');
    await validateTextZoom(creator.page, '[data-prototype-invite-receipt]');
    await creator.page.emulateMedia({ reducedMotion: 'reduce' });
    await expectNoSeriousAxeViolations(creator.page);

    await copyButton.click();
    await expect(copyButton).toBeDisabled();
    await expect(copyButton).toHaveAttribute('aria-busy', 'true');
    await creator.page.evaluate(() => window.__resolveInviteCopy?.());
    await expect(copyButton).toBeEnabled();
    await expect(copyButton).not.toHaveAttribute('aria-busy', 'true');
    const inviteUrl = await creator.page.evaluate(() => window.__copiedInvite);
    expect(inviteUrl).toContain('#invite=');
    expect(new URL(inviteUrl).search).toBe('');
    expect(inviteUrl).not.toContain('@');

    const follower = await createLocalizedPage(browser, baseURL, locale, 'success');
    await follower.page.goto(inviteUrl);
    await expect(follower.page.locator('.prototype-invite-entry')).toBeVisible();
    await expect(follower.page.locator('.nav-create')).toBeHidden();
    await expect(follower.page.locator('.creator-tools')).toBeHidden();
    await captureState(follower.page, testInfo, locale, 'follower-entry');
    await validateTextZoom(follower.page, '.prototype-invite-entry');
    await expectNoSeriousAxeViolations(follower.page);

    const lastLanguageButton = follower.page.locator('[data-locale="ar"]');
    await lastLanguageButton.focus();
    await follower.page.keyboard.press('Tab');
    await expect(follower.page.locator('[data-role="builder"]')).toBeFocused();
    await expectMinimumTarget(follower.page.locator('[data-role="builder"]'));

    await follower.page.locator('[data-role="builder"]').click();
    await captureState(follower.page, testInfo, locale, 'role-ready');
    await follower.page.locator('[data-route="sky"]').click();
    await expect(follower.page.locator('[data-mission-result]')).toBeVisible();
    await captureState(follower.page, testInfo, locale, 'result-ready');
    await expect(follower.page.locator('.nav-create')).toBeVisible();
    await expectNoSeriousAxeViolations(follower.page);

    const invalid = await createLocalizedPage(browser, baseURL, locale, 'success');
    await invalid.page.goto('/#invite=bad-token');
    await expect(invalid.page.locator('[data-prototype-invite-invalid]')).toBeVisible();
    await expect(invalid.page.locator('#prototype-invite-error-title')).toBeFocused();
    await expectMinimumTarget(invalid.page.locator('[data-invite-action="recover"]'));
    await captureState(invalid.page, testInfo, locale, 'invalid-recovery');
    await validateTextZoom(invalid.page, '[data-prototype-invite-invalid]');
    await expectNoSeriousAxeViolations(invalid.page);
    await invalid.page.locator('[data-invite-action="recover"]').click();
    await expect(invalid.page).not.toHaveURL(/#invite=/u);
    await expect(invalid.page.locator('.role-grid')).toBeVisible();

    await creator.context.close();
    await follower.context.close();
    await invalid.context.close();
  });
}

test('copy denial reveals only the selected fragment link and retries successfully', async ({ browser, baseURL }, testInfo) => {
  const controlled = await createLocalizedPage(browser, baseURL, 'en', 'failure');
  const copyButton = await completeCreatorOnboarding(controlled.page, 'en', testInfo);
  await copyButton.click();

  const fallback = controlled.page.locator('[data-invite-fallback]');
  const field = fallback.locator('input');
  await expect(fallback).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('readonly', '');
  await expect(field).toHaveAttribute('dir', 'ltr');
  expect(new URL(await field.inputValue()).search).toBe('');

  await controlled.page.evaluate(() => { window.__copyShouldFail = false; });
  await copyButton.click();
  await expect(fallback).toBeHidden();
  await expect(copyButton).toBeFocused();
  await controlled.context.close();
});

test('valid invite, selected role, and result survive language reload and resize', async ({ browser, baseURL }) => {
  const state = await createLocalizedPage(browser, baseURL, 'en', 'success');
  await state.page.goto('/');
  const inviteUrl = await state.page.evaluate(async () => {
    const domain = await import('/src/prototype-invite.js');
    const token = domain.serializePrototypeInvite(domain.createPrototypeInvite({
      realmName: 'Quiet Circuit',
      theme: 'future',
      communityPromise: 'A fictional community improving safe systems together.',
    }));
    return domain.buildPrototypeInviteUrl(window.location, token);
  });

  await state.page.goto(inviteUrl);
  await state.page.locator('[data-role="explorer"]').click();
  await state.page.locator('[data-locale="ar"]').click();
  await expect(state.page.locator('[data-role="explorer"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(state.page.locator('.prototype-invite-entry')).toContainText('Quiet Circuit');
  await state.page.setViewportSize({ width: 320, height: 568 });
  await assertNoHorizontalOverflow(state.page);
  await state.page.locator('[data-route="ocean"]').click();
  await expect(state.page.locator('[data-mission-result]')).toBeVisible();
  await state.page.locator('[data-locale="en"]').click();
  await expect(state.page.locator('[data-mission-result]')).toBeVisible();
  await expect(state.page.locator('.prototype-invite-entry')).toContainText('Quiet Circuit');
  await state.context.close();
});
