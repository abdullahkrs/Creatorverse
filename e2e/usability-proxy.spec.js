import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  USABILITY_PROXY_EVIDENCE_TYPE,
  writeUsabilityProxyReport,
} from '../scripts/usability-proxy-report.mjs';

const expectedSha = process.env.USABILITY_PROXY_SHA || '';
const expectedRef = process.env.USABILITY_PROXY_REF || '';
const verifiedPreviewUrl = (process.env.USABILITY_PROXY_URL || '').replace(/\/$/u, '');
const screenshotRoot = 'test-results/usability-proxy/screenshots';
mkdirSync(screenshotRoot, { recursive: true });

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const profiles = [
  { id: 'ar-rtl-touch-320x568', locale: 'ar', direction: 'rtl', input: 'touch', viewport: { width: 320, height: 568 }, stepBudget: 14 },
  { id: 'ar-rtl-keyboard-390x844', locale: 'ar', direction: 'rtl', input: 'keyboard', viewport: { width: 390, height: 844 }, stepBudget: 14 },
  { id: 'en-ltr-touch-320x568', locale: 'en', direction: 'ltr', input: 'touch', viewport: { width: 320, height: 568 }, stepBudget: 14 },
  { id: 'en-ltr-keyboard-390x844', locale: 'en', direction: 'ltr', input: 'keyboard', viewport: { width: 390, height: 844 }, stepBudget: 14 },
];

async function configureContext(context, locale, clipboardMode = 'success') {
  await context.addInitScript(({ selectedLocale, initialClipboardMode }) => {
    localStorage.setItem('creatorverse-locale', selectedLocale);
    window.__copiedPrototypeInvite = '';
    window.__copiedMissionResult = '';
    window.__clipboardAttempts = 0;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          window.__clipboardAttempts += 1;
          if (initialClipboardMode === 'fail-once' && window.__clipboardAttempts === 1) {
            throw new DOMException('Controlled clipboard denial', 'NotAllowedError');
          }
          if (String(value).includes('#invite=v1.')) window.__copiedPrototypeInvite = value;
          else window.__copiedMissionResult = value;
        },
      },
    });
  }, { selectedLocale: locale, initialClipboardMode: clipboardMode });
}

async function createContext(browser, baseURL, profile, clipboardMode = 'success') {
  const context = await browser.newContext({
    baseURL,
    viewport: profile.viewport,
    hasTouch: profile.input === 'touch',
    isMobile: profile.input === 'touch',
    reducedMotion: 'reduce',
  });
  await configureContext(context, profile.locale, clipboardMode);
  return context;
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectVisibleButtonNames(page) {
  const unnamed = await page.locator('button:visible').evaluateAll(buttons => buttons
    .filter(button => !button.disabled)
    .map(button => ({
      name: button.getAttribute('aria-label') || button.textContent?.trim() || '',
      html: button.outerHTML.slice(0, 180),
    }))
    .filter(button => !button.name));
  expect(unnamed).toEqual([]);
}

async function expectTouchTargets(page) {
  const targets = await page.locator('button:visible').evaluateAll(buttons => buttons
    .filter(button => !button.disabled)
    .map(button => {
      const rect = button.getBoundingClientRect();
      return {
        name: button.getAttribute('aria-label') || button.textContent?.trim() || 'button',
        width: rect.width,
        height: rect.height,
      };
    }));
  for (const target of targets) {
    expect(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
  }
}

async function expectOnePrimaryAction(page, scope = 'body') {
  const count = await page.locator(`${scope} button.primary:visible:not([disabled])`).count();
  expect(count, `${scope} should expose at most one enabled primary action`).toBeLessThanOrEqual(1);
}

async function expectVisibleFocus(locator) {
  await locator.focus();
  await expect(locator).toBeFocused();
  const focus = await locator.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      visible: node.matches(':focus-visible'),
      outline: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focus.visible).toBe(true);
  expect(focus.outline).not.toBe('none');
  expect(focus.width).toBeGreaterThan(0);
}

async function expectNoBlockingAxeViolations(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(blocking, `${label}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

async function assertViewQuality(page, { direction, axeLabel = '', primaryScope = 'body' }) {
  await expect(page.locator('html')).toHaveAttribute('dir', direction);
  await expectNoHorizontalOverflow(page);
  await expectVisibleButtonNames(page);
  await expectTouchTargets(page);
  await expectOnePrimaryAction(page, primaryScope);
  if (axeLabel) await expectNoBlockingAxeViolations(page, axeLabel);
}

async function activate(locator, input) {
  if (input === 'keyboard') {
    await expectVisibleFocus(locator);
    await locator.press('Enter');
  } else {
    await locator.click();
  }
}

async function expectLogicalTabOrder(page) {
  await page.evaluate(() => document.activeElement?.blur());
  const order = [];
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press('Tab');
    const token = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return '';
      if (element.dataset.action) return `action:${element.dataset.action}`;
      if (element.dataset.locale) return `locale:${element.dataset.locale}`;
      if (element.dataset.role) return `role:${element.dataset.role}`;
      return `${element.tagName.toLowerCase()}:${element.textContent?.trim().slice(0, 30) || element.getAttribute('aria-label') || ''}`;
    });
    order.push(token);
  }
  const builder = order.indexOf('role:builder');
  const explorer = order.indexOf('role:explorer');
  const guardian = order.indexOf('role:guardian');
  expect(order).toContain('action:creator');
  expect(builder).toBeGreaterThan(-1);
  expect(explorer).toBeGreaterThan(builder);
  expect(guardian).toBeGreaterThan(explorer);
}

async function completeCreatorOnboarding(page, input) {
  let steps = 0;
  await activate(page.locator('[data-action="creator"]'), input);
  steps += 1;
  await expect(page.locator('#creator-studio')).toBeVisible();
  await assertViewQuality(page, { direction: await page.locator('html').getAttribute('dir') });
  for (let index = 0; index < 3; index += 1) {
    await activate(page.locator('[data-action="creator-next"]'), input);
    steps += 1;
  }
  await expect(page.locator('[data-prototype-invite-receipt]')).toBeVisible();
  await expect(page.locator('[data-action="copy-prototype-invite"]')).toBeFocused();
  return steps;
}

async function runCoreProfile(browser, baseURL, profile) {
  const startedAt = Date.now();
  let steps = 0;
  const dialogs = [];
  const creatorContext = await createContext(browser, baseURL, profile);
  const creatorPage = await creatorContext.newPage();
  creatorPage.on('dialog', dialog => dialogs.push(dialog.type()));
  await creatorPage.goto('/');
  if (profile.input === 'keyboard') await expectLogicalTabOrder(creatorPage);
  await assertViewQuality(creatorPage, { direction: profile.direction, axeLabel: `${profile.id} initial` });

  steps += await completeCreatorOnboarding(creatorPage, profile.input);
  await assertViewQuality(creatorPage, { direction: profile.direction, axeLabel: `${profile.id} invite receipt` });
  await activate(creatorPage.locator('[data-action="copy-prototype-invite"]'), profile.input);
  steps += 1;
  await expect(creatorPage.locator('[data-action="copy-prototype-invite"]')).toContainText(profile.locale === 'ar' ? 'تم النسخ' : 'Copied');
  const inviteUrl = await creatorPage.evaluate(() => window.__copiedPrototypeInvite);
  expect(inviteUrl).toContain('#invite=v1.');
  expect(inviteUrl).not.toContain('?');

  const followerContext = await createContext(browser, baseURL, profile);
  const followerPage = await followerContext.newPage();
  followerPage.on('dialog', dialog => dialogs.push(dialog.type()));
  await followerPage.goto(inviteUrl);
  await expect(followerPage.locator('[data-prototype-follower-entry]')).toBeVisible();
  await expect(followerPage.locator('[data-role]')).toHaveCount(3);
  await assertViewQuality(followerPage, { direction: profile.direction, axeLabel: `${profile.id} follower entry` });

  const role = followerPage.locator('[data-role="builder"]');
  await activate(role, profile.input);
  steps += 1;
  await expect(role).toHaveAttribute('aria-pressed', 'true');

  const route = followerPage.locator('[data-route="sky"]');
  await activate(route, profile.input);
  steps += 1;
  const result = followerPage.locator('[data-mission-result]');
  await expect(result).toBeVisible();
  await expect(result.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '75');
  await expect(result.locator('.signal-result-facts > div')).toHaveCount(4);
  await assertViewQuality(followerPage, { direction: profile.direction, axeLabel: `${profile.id} result` });

  const resultAction = followerPage.locator('[data-action="mission-result-action"]');
  await activate(resultAction, profile.input);
  steps += 1;
  await expect(resultAction).toContainText(profile.locale === 'ar' ? 'تم النسخ' : 'Copied');
  expect(await followerPage.evaluate(() => window.__copiedMissionResult)).toContain(new URL(inviteUrl).origin);

  const screenshotPath = `${screenshotRoot}/${profile.id}.png`;
  await followerPage.screenshot({ path: screenshotPath, fullPage: true });

  const nextLocale = profile.locale === 'ar' ? 'en' : 'ar';
  const nextDirection = nextLocale === 'ar' ? 'rtl' : 'ltr';
  const language = followerPage.locator(`[data-locale="${nextLocale}"]`);
  if (profile.input === 'keyboard') await expectVisibleFocus(language);
  await Promise.all([
    followerPage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    profile.input === 'keyboard' ? language.press('Enter') : language.click(),
  ]);
  steps += 1;
  await expect(followerPage.locator('html')).toHaveAttribute('lang', nextLocale);
  await expect(followerPage.locator('html')).toHaveAttribute('dir', nextDirection);
  await expect(followerPage.locator('[data-role="builder"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(followerPage.locator('[data-mission-result]')).toBeVisible();
  await assertViewQuality(followerPage, { direction: nextDirection, axeLabel: `${profile.id} language preservation` });

  expect(dialogs).toEqual([]);
  expect(steps).toBeLessThanOrEqual(profile.stepBudget);
  await creatorContext.close();
  await followerContext.close();

  return {
    id: profile.id,
    status: 'PASS',
    steps,
    stepBudget: profile.stepBudget,
    elapsedMs: Date.now() - startedAt,
    checks: [
      'isolated-storage',
      'visible-controls',
      'single-primary-action',
      'accessible-names-focus-order',
      '44px-targets-no-overflow',
      'creator-invite-follower-role-route-result-share',
      'language-direction-state-preservation',
      'axe-no-serious-critical',
    ],
    screenshots: [screenshotPath],
  };
}

async function runRecoveryProfile(browser, baseURL) {
  const startedAt = Date.now();
  let steps = 0;
  const recoveryProfile = {
    id: 'fresh-session-recovery',
    locale: 'en',
    direction: 'ltr',
    input: 'touch',
    viewport: { width: 390, height: 844 },
    stepBudget: 18,
  };
  const states = [];
  const screenshots = [];

  const invalidContext = await createContext(browser, baseURL, recoveryProfile);
  const invalidPage = await invalidContext.newPage();
  await invalidPage.goto('/#invite=v1.invalid!');
  await expect(invalidPage.locator('[data-prototype-invite-error]')).toBeVisible();
  await expect(invalidPage.locator('#invite-error-title')).toBeFocused();
  await assertViewQuality(invalidPage, { direction: 'ltr', axeLabel: 'invalid invite' });
  await invalidPage.locator('[data-action="open-featured-realm"]').click();
  steps += 1;
  await expect(invalidPage).not.toHaveURL(/#invite=/u);
  await expect(invalidPage.locator('[data-role]')).toHaveCount(3);
  states.push({ id: 'invalid-invite', status: 'PASS', recovery: 'The named featured-realm action removed the malformed fragment and restored the normal role view.' });
  await invalidContext.close();

  const copyContext = await createContext(browser, baseURL, recoveryProfile, 'fail-once');
  const copyPage = await copyContext.newPage();
  await copyPage.goto('/');
  steps += await completeCreatorOnboarding(copyPage, 'touch');
  const copyAction = copyPage.locator('[data-action="copy-prototype-invite"]');
  await copyAction.click();
  steps += 1;
  await expect(copyPage.locator('[data-invite-manual-url]')).toBeVisible();
  await expect(copyAction).toBeFocused();
  await assertViewQuality(copyPage, { direction: 'ltr', axeLabel: 'copy recovery' });
  await copyAction.click();
  steps += 1;
  await expect(copyAction).toContainText('Copied');
  states.push({ id: 'recoverable-copy-failure', status: 'PASS', recovery: 'Clipboard denial exposed a selected safe URL and the same named action succeeded on retry.' });
  await copyContext.close();

  const serviceContext = await createContext(browser, baseURL, recoveryProfile);
  let profileCalls = 0;
  await serviceContext.route('**/api/social/profile', async route => {
    profileCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 250));
    if (profileCalls === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'PROFILE_PROVIDER_TIMEOUT' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: {
          providerLabel: 'YouTube',
          title: 'Synthetic Signal Studio',
          description: 'A fictional public profile fixture.',
          avatarUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"/%3E',
          subscriberCount: 12,
          videoCount: 3,
          viewCount: 90,
          sourceUrl: 'https://www.youtube.com/@synthetic-signal',
          customUrl: '@synthetic-signal',
        },
      }),
    });
  });

  let missionImportCalls = 0;
  await serviceContext.route('**/api/social/preview', async route => {
    missionImportCalls += 1;
    if (missionImportCalls === 1) {
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'SOCIAL_PROVIDER_REJECTED' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        preview: {
          providerLabel: 'YouTube',
          type: 'video',
          title: 'Synthetic route signal',
          authorName: 'Fictional Creator',
          thumbnailUrl: null,
          sourceUrl: 'https://www.youtube.com/watch?v=synthetic-signal',
        },
      }),
    });
  });

  const servicePage = await serviceContext.newPage();
  await servicePage.goto('/');
  await servicePage.locator('.creator-tools summary').click();
  steps += 1;
  await expect(servicePage.locator('.profile-empty')).toContainText('No profile imported.');
  states.push({ id: 'empty-content', status: 'PASS', recovery: 'The empty profile region named the missing content and kept the public-link form available.' });

  await servicePage.locator('#profile-url').fill('https://www.youtube.com/@synthetic-signal');
  await servicePage.locator('[data-profile-form] button[type="submit"]').click();
  steps += 1;
  await expect(servicePage.locator('[data-profile-form] button[type="submit"]')).toBeDisabled();
  await expect(servicePage.locator('[data-profile-form] button[type="submit"]')).toContainText('Fetching');
  states.push({ id: 'loading', status: 'PASS', recovery: 'The submit action exposed a named disabled loading state while the controlled request was pending.' });
  await expect(servicePage.locator('#profile-import .form-message')).toContainText('took too long');
  await expect(servicePage.locator('[data-profile-form] button[type="submit"]')).toBeEnabled();
  await assertViewQuality(servicePage, { direction: 'ltr', axeLabel: 'service error', primaryScope: '#profile-import' });
  await servicePage.locator('[data-profile-form] button[type="submit"]').click();
  steps += 1;
  await expect(servicePage.locator('.profile-card')).toContainText('Synthetic Signal Studio');
  states.push({ id: 'network-service-error', status: 'PASS', recovery: 'The localized timeout kept the named fetch action enabled, and retry rendered the safe synthetic profile.' });

  await servicePage.locator('#social-url').fill('https://www.youtube.com/watch?v=synthetic-signal');
  await servicePage.locator('[data-form="social-import"] button[type="submit"]').click();
  steps += 1;
  await expect(servicePage.locator('.social-message')).toContainText('did not provide public metadata');
  await expect(servicePage.locator('[data-form="social-import"] button[type="submit"]').toBeEnabled();
  await assertViewQuality(servicePage, { direction: 'ltr', axeLabel: 'mission source error', primaryScope: '#social-import' });
  await servicePage.locator('[data-form="social-import"] button[type="submit"]').click();
  steps += 1;
  await expect(servicePage.locator('[data-action="use-social-post"]')).toBeVisible();
  await servicePage.locator('[data-action="use-social-post"]').click();
  steps += 1;
  await expect(servicePage.locator('.realm-tagline')).toContainText('Mission inspired by Fictional Creator');
  states.push({ id: 'recoverable-mission-failure', status: 'PASS', recovery: 'A rejected public mission-source request preserved the form; retry succeeded and the visible Use for mission action updated the realm.' });

  const recoveryScreenshot = `${screenshotRoot}/fresh-session-recovery.png`;
  await servicePage.screenshot({ path: recoveryScreenshot, fullPage: true });
  screenshots.push(recoveryScreenshot);
  await serviceContext.close();
  expect(steps).toBeLessThanOrEqual(recoveryProfile.stepBudget);

  return {
    profile: {
      id: recoveryProfile.id,
      status: 'PASS',
      steps,
      stepBudget: recoveryProfile.stepBudget,
      elapsedMs: Date.now() - startedAt,
      checks: [
        'fresh-isolated-contexts',
        'invalid-invite-recovery',
        'copy-denial-retry',
        'empty-loading-service-retry',
        'mission-source-retry',
        'axe-no-serious-critical',
      ],
      screenshots,
    },
    states,
  };
}

test('five deterministic profiles produce one exact-head automated proxy report', async ({ browser, request, baseURL }) => {
  expect(expectedSha).toMatch(/^[0-9a-f]{40}$/u);
  expect(expectedRef.length).toBeGreaterThan(0);
  expect(verifiedPreviewUrl).toBe((baseURL || '').replace(/\/$/u, ''));
  expect(verifiedPreviewUrl).toMatch(/-pr-\d+\.up\.railway\.app$/u);
  expect(verifiedPreviewUrl).not.toMatch(/production/iu);

  const healthResponse = await request.get('/health');
  const versionResponse = await request.get('/version');
  expect(healthResponse.ok()).toBe(true);
  expect(versionResponse.ok()).toBe(true);
  const health = await healthResponse.json();
  const version = await versionResponse.json();
  expect(health.status).toBe('ok');
  expect(version.commitSha).toBe(expectedSha);
  expect(version.branch).toBe(expectedRef);
  expect(String(version.environment || '').toLowerCase()).not.toBe('production');

  const profileResults = [];
  for (const profile of profiles) profileResults.push(await runCoreProfile(browser, baseURL, profile));
  const recovery = await runRecoveryProfile(browser, baseURL);
  profileResults.push(recovery.profile);

  const report = {
    schemaVersion: 1,
    evidenceType: USABILITY_PROXY_EVIDENCE_TYPE,
    disclaimer: 'Engineering automation only; no people were recruited or observed.',
    decision: 'AUTOMATED_PROXY_PASS',
    generatedAt: new Date().toISOString(),
    identity: {
      headSha: expectedSha,
      branch: expectedRef,
      previewUrl: verifiedPreviewUrl,
      healthStatus: health.status,
      versionCommitSha: version.commitSha,
      versionBranch: version.branch,
    },
    profiles: profileResults,
    states: recovery.states,
  };

  await writeUsabilityProxyReport(report, {
    validation: {
      expectedSha,
      expectedRef,
      expectedPreviewUrl: verifiedPreviewUrl,
    },
  });
});
