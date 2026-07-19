import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  USABILITY_PROXY_EVIDENCE_TYPE,
  writeUsabilityProxyReport,
} from '../scripts/usability-proxy-report.mjs';

const EXPECTED_SHA = process.env.USABILITY_PROXY_SHA || '';
const EXPECTED_REF = process.env.USABILITY_PROXY_REF || '';
const PREVIEW_URL = (process.env.USABILITY_PROXY_URL || '').replace(/\/$/u, '');
const SCREENSHOT_DIR = 'test-results/usability-proxy/screenshots';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

test.setTimeout(120_000);

const CORE_PROFILES = [
  { id: 'ar-rtl-touch-320x568', locale: 'ar', dir: 'rtl', input: 'touch', viewport: { width: 320, height: 568 } },
  { id: 'ar-rtl-keyboard-390x844', locale: 'ar', dir: 'rtl', input: 'keyboard', viewport: { width: 390, height: 844 } },
  { id: 'en-ltr-touch-320x568', locale: 'en', dir: 'ltr', input: 'touch', viewport: { width: 320, height: 568 } },
  { id: 'en-ltr-keyboard-390x844', locale: 'en', dir: 'ltr', input: 'keyboard', viewport: { width: 390, height: 844 } },
];

async function makeContext(browser, baseURL, profile, clipboard = 'success') {
  const context = await browser.newContext({
    baseURL,
    viewport: profile.viewport,
    hasTouch: profile.input === 'touch',
    isMobile: profile.input === 'touch',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(({ locale, clipboardMode }) => {
    if (!localStorage.getItem('creatorverse-locale')) localStorage.setItem('creatorverse-locale', locale);
    window.__copiedInvite = '';
    window.__copiedResult = '';
    window.__clipboardCalls = 0;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          window.__clipboardCalls += 1;
          if (clipboardMode === 'fail-once' && window.__clipboardCalls === 1) {
            throw new DOMException('Controlled clipboard denial', 'NotAllowedError');
          }
          if (String(value).includes('#invite=v1.')) window.__copiedInvite = value;
          else window.__copiedResult = value;
        },
      },
    });
  }, { locale: profile.locale, clipboardMode: clipboard });
  return context;
}

async function axe(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(blocking, `${label}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

async function quality(page, { dir, primaryScope = 'body', runAxe = false, label = '' }) {
  await expect(page.locator('html')).toHaveAttribute('dir', dir);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const controls = await page.locator('button:visible').evaluateAll(buttons => buttons
    .filter(button => !button.disabled)
    .map(button => {
      const rect = button.getBoundingClientRect();
      return {
        name: button.getAttribute('aria-label') || button.textContent?.trim() || '',
        width: rect.width,
        height: rect.height,
      };
    }));
  for (const control of controls) {
    expect(control.name).not.toBe('');
    expect(control.width, `${control.name} width`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.name} height`).toBeGreaterThanOrEqual(44);
  }

  const primaries = await page.locator(`${primaryScope} button.primary:visible:not([disabled])`).count();
  expect(primaries, `${primaryScope} primary actions`).toBeLessThanOrEqual(1);
  if (runAxe) await axe(page, label);
}

async function tabTo(page, selector, maximum = 36) {
  for (let index = 0; index < maximum; index += 1) {
    const matches = await page.evaluate(target => document.activeElement?.matches(target) || false, selector);
    if (matches) {
      const visible = await page.evaluate(() => document.activeElement?.matches(':focus-visible') || false);
      expect(visible, `${selector} must expose visible keyboard focus`).toBe(true);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard focus did not reach ${selector}.`);
}

async function activate(page, selector, input) {
  const locator = page.locator(selector);
  if (input === 'keyboard') {
    await tabTo(page, selector);
    await page.keyboard.press('Enter');
  } else {
    await locator.click();
  }
}

async function creatorInvite(page, profile, { expectInitialCopyFailure = false } = {}) {
  let steps = 0;
  await activate(page, '[data-action="creator"]', profile.input);
  steps += 1;
  await expect(page.locator('#creator-studio')).toBeVisible();
  await quality(page, { dir: profile.dir });
  for (let index = 0; index < 3; index += 1) {
    await activate(page, '[data-action="creator-next"]', profile.input);
    steps += 1;
  }
  await expect(page.locator('[data-prototype-invite-receipt]')).toBeVisible();
  await quality(page, { dir: profile.dir, runAxe: true, label: `${profile.id} invite receipt` });
  const copyAction = page.locator('[data-action="copy-prototype-invite"]');
  await activate(page, '[data-action="copy-prototype-invite"]', profile.input);
  steps += 1;
  if (expectInitialCopyFailure) {
    await expect(page.locator('[data-invite-manual-url]')).toBeVisible();
    await expect(copyAction).toBeFocused();
    return { invite: '', steps };
  }
  await expect(copyAction).toContainText(profile.locale === 'ar' ? 'تم النسخ' : 'Copied');
  const invite = await page.evaluate(() => window.__copiedInvite);
  expect(invite).toContain('#invite=v1.');
  expect(invite).not.toContain('?');
  return { invite, steps };
}

async function runCore(browser, baseURL, profile) {
  const started = Date.now();
  let steps = 0;
  const dialogs = [];
  const creatorContext = await makeContext(browser, baseURL, profile);
  const creator = await creatorContext.newPage();
  creator.on('dialog', dialog => dialogs.push(dialog.type()));
  await creator.goto('/');
  await quality(creator, { dir: profile.dir, runAxe: true, label: `${profile.id} initial` });

  const receipt = await creatorInvite(creator, profile);
  steps += receipt.steps;

  const followerContext = await makeContext(browser, baseURL, profile);
  const follower = await followerContext.newPage();
  follower.on('dialog', dialog => dialogs.push(dialog.type()));
  await follower.goto(receipt.invite);
  await expect(follower.locator('[data-prototype-follower-entry]')).toBeVisible();
  await expect(follower.locator('[data-role]')).toHaveCount(3);
  await quality(follower, { dir: profile.dir, runAxe: true, label: `${profile.id} follower entry` });

  await activate(follower, '[data-role="builder"]', profile.input);
  steps += 1;
  await expect(follower.locator('[data-role="builder"]')).toHaveAttribute('aria-pressed', 'true');
  await activate(follower, '[data-route="sky"]', profile.input);
  steps += 1;

  const result = follower.locator('[data-mission-result]');
  await expect(result).toBeVisible();
  await expect(result.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '75');
  await expect(result.locator('.signal-result-facts > div')).toHaveCount(4);
  await quality(follower, { dir: profile.dir, runAxe: true, label: `${profile.id} result` });

  await activate(follower, '[data-action="mission-result-action"]', profile.input);
  steps += 1;
  await expect(follower.locator('[data-action="mission-result-action"]')).toContainText(profile.locale === 'ar' ? 'تم النسخ' : 'Copied');
  expect(await follower.evaluate(() => window.__copiedResult)).toContain(new URL(receipt.invite).origin);

  const screenshot = `${SCREENSHOT_DIR}/${profile.id}.png`;
  await follower.screenshot({ path: screenshot, fullPage: true });

  const nextLocale = profile.locale === 'ar' ? 'en' : 'ar';
  const nextDir = nextLocale === 'ar' ? 'rtl' : 'ltr';
  const switchSelector = `[data-locale="${nextLocale}"]`;
  if (profile.input === 'keyboard') await tabTo(follower, switchSelector);
  await Promise.all([
    follower.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    profile.input === 'keyboard'
      ? follower.keyboard.press('Enter')
      : follower.locator(switchSelector).click(),
  ]);
  steps += 1;
  await expect(follower.locator('html')).toHaveAttribute('lang', nextLocale);
  await expect(follower.locator('html')).toHaveAttribute('dir', nextDir);
  await expect(follower.locator('[data-role="builder"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(follower.locator('[data-mission-result]')).toBeVisible();
  await quality(follower, { dir: nextDir, runAxe: true, label: `${profile.id} preserved state` });

  expect(dialogs).toEqual([]);
  expect(steps).toBeLessThanOrEqual(14);
  await creatorContext.close();
  await followerContext.close();

  return {
    id: profile.id,
    status: 'PASS',
    steps,
    stepBudget: 14,
    elapsedMs: Date.now() - started,
    checks: [
      'isolated-storage',
      'visible-controls',
      'single-primary-action',
      'accessible-names-keyboard-focus',
      '44px-targets-no-overflow',
      'creator-invite-follower-role-route-result-share',
      'language-direction-state-preservation',
      'axe-no-serious-critical',
    ],
    screenshots: [screenshot],
  };
}

async function runRecovery(browser, baseURL) {
  const started = Date.now();
  let steps = 0;
  const profile = { locale: 'en', dir: 'ltr', input: 'touch', viewport: { width: 390, height: 844 } };
  const states = [];

  const invalidContext = await makeContext(browser, baseURL, profile);
  const invalid = await invalidContext.newPage();
  await invalid.goto('/#invite=v1.invalid!');
  await expect(invalid.locator('[data-prototype-invite-error]')).toBeVisible();
  await expect(invalid.locator('#invite-error-title')).toBeFocused();
  await quality(invalid, { dir: 'ltr', runAxe: true, label: 'invalid invite' });
  await invalid.locator('[data-action="open-featured-realm"]').click();
  steps += 1;
  await expect(invalid).not.toHaveURL(/#invite=/u);
  states.push({ id: 'invalid-invite', status: 'PASS', recovery: 'The named featured-realm action removed the malformed fragment and restored the role view.' });
  await invalidContext.close();

  const copyContext = await makeContext(browser, baseURL, profile, 'fail-once');
  const copy = await copyContext.newPage();
  await copy.goto('/');
  const receipt = await creatorInvite(copy, profile, { expectInitialCopyFailure: true });
  steps += receipt.steps;
  const copyAction = copy.locator('[data-action="copy-prototype-invite"]');
  await expect(copy.locator('[data-invite-manual-url]')).toBeVisible();
  await expect(copyAction).toBeFocused();
  await quality(copy, { dir: 'ltr', runAxe: true, label: 'copy denial' });
  await copyAction.click();
  steps += 1;
  await expect(copyAction).toContainText('Copied');
  states.push({ id: 'recoverable-copy-failure', status: 'PASS', recovery: 'Clipboard denial exposed a selected safe URL and the same named action succeeded on retry.' });
  await copyContext.close();

  const serviceContext = await makeContext(browser, baseURL, profile);
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
      body: JSON.stringify({ profile: {
        providerLabel: 'YouTube',
        title: 'Synthetic Signal Studio',
        description: 'A fictional public profile fixture.',
        avatarUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"/%3E',
        subscriberCount: 12,
        videoCount: 3,
        viewCount: 90,
        sourceUrl: 'https://www.youtube.com/@synthetic-signal',
        customUrl: '@synthetic-signal',
      } }),
    });
  });

  let missionCalls = 0;
  await serviceContext.route('**/api/social/preview', async route => {
    missionCalls += 1;
    if (missionCalls === 1) {
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'SOCIAL_PROVIDER_REJECTED' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ preview: {
        providerLabel: 'YouTube',
        type: 'video',
        title: 'Synthetic route signal',
        authorName: 'Fictional Creator',
        thumbnailUrl: null,
        sourceUrl: 'https://www.youtube.com/watch?v=synthetic-signal',
      } }),
    });
  });

  const service = await serviceContext.newPage();
  await service.goto('/');
  await service.locator('.creator-tools summary').click();
  steps += 1;
  await expect(service.locator('.profile-empty')).toContainText('No profile imported.');
  states.push({ id: 'empty-content', status: 'PASS', recovery: 'The empty region named the missing content and kept the public-link form available.' });

  const profileSubmit = service.locator('[data-profile-form] button[type="submit"]');
  await service.locator('#profile-url').fill('https://www.youtube.com/@synthetic-signal');
  await profileSubmit.click();
  steps += 1;
  await expect(profileSubmit).toBeDisabled();
  await expect(profileSubmit).toContainText('Fetching');
  states.push({ id: 'loading', status: 'PASS', recovery: 'The submit action exposed a named disabled loading state during the controlled request.' });
  await expect(service.locator('#profile-import .form-message')).toContainText('took too long');
  await expect(profileSubmit).toBeEnabled();
  await quality(service, { dir: 'ltr', primaryScope: '#profile-import', runAxe: true, label: 'service error' });
  await profileSubmit.click();
  steps += 1;
  await expect(service.locator('.profile-card')).toContainText('Synthetic Signal Studio');
  states.push({ id: 'network-service-error', status: 'PASS', recovery: 'The timeout kept the named fetch action enabled, and retry rendered the safe synthetic profile.' });

  const missionSubmit = service.locator('[data-form="social-import"] button[type="submit"]');
  await service.locator('#social-url').fill('https://www.youtube.com/watch?v=synthetic-signal');
  await missionSubmit.click();
  steps += 1;
  await expect(service.locator('.social-message')).toContainText('did not provide public metadata');
  await expect(missionSubmit).toBeEnabled();
  await quality(service, { dir: 'ltr', primaryScope: '#social-import', runAxe: true, label: 'mission source error' });
  await missionSubmit.click();
  steps += 1;
  await expect(service.locator('[data-action="use-social-post"]')).toBeVisible();
  await service.locator('[data-action="use-social-post"]').click();
  steps += 1;
  await expect(service.locator('.realm-tagline')).toContainText('Mission inspired by Fictional Creator');
  states.push({ id: 'recoverable-mission-failure', status: 'PASS', recovery: 'The rejected mission-source request preserved its form; retry and the named mission action updated the realm.' });

  const screenshot = `${SCREENSHOT_DIR}/fresh-session-recovery.png`;
  await service.screenshot({ path: screenshot, fullPage: true });
  await serviceContext.close();
  expect(steps).toBeLessThanOrEqual(18);

  return {
    profile: {
      id: 'fresh-session-recovery',
      status: 'PASS',
      steps,
      stepBudget: 18,
      elapsedMs: Date.now() - started,
      checks: ['fresh-contexts', 'invalid-recovery', 'copy-retry', 'empty-loading-service-retry', 'mission-source-retry', 'axe-no-serious-critical'],
      screenshots: [screenshot],
    },
    states,
  };
}

test('five deterministic profiles produce an exact-head automated proxy report', async ({ browser, request, baseURL }) => {
  expect(EXPECTED_SHA).toMatch(/^[0-9a-f]{40}$/u);
  expect(EXPECTED_REF.length).toBeGreaterThan(0);
  expect(PREVIEW_URL).toBe((baseURL || '').replace(/\/$/u, ''));
  expect(PREVIEW_URL).toMatch(/-pr-\d+\.up\.railway\.app$/u);
  expect(PREVIEW_URL).not.toMatch(/production/iu);

  const healthResponse = await request.get('/health');
  const versionResponse = await request.get('/version');
  expect(healthResponse.ok()).toBe(true);
  expect(versionResponse.ok()).toBe(true);
  const health = await healthResponse.json();
  const version = await versionResponse.json();
  expect(health.status).toBe('ok');
  expect(version.commitSha).toBe(EXPECTED_SHA);
  expect(version.branch).toBe(EXPECTED_REF);
  expect(String(version.environment || '').toLowerCase()).not.toBe('production');

  const profileResults = [];
  for (const profile of CORE_PROFILES) profileResults.push(await runCore(browser, baseURL, profile));
  const recovery = await runRecovery(browser, baseURL);
  profileResults.push(recovery.profile);

  await writeUsabilityProxyReport({
    schemaVersion: 1,
    evidenceType: USABILITY_PROXY_EVIDENCE_TYPE,
    disclaimer: 'Engineering automation only; no people were recruited or observed.',
    decision: 'AUTOMATED_PROXY_PASS',
    generatedAt: new Date().toISOString(),
    identity: {
      headSha: EXPECTED_SHA,
      branch: EXPECTED_REF,
      previewUrl: PREVIEW_URL,
      healthStatus: health.status,
      versionCommitSha: version.commitSha,
      versionBranch: version.branch,
    },
    profiles: profileResults,
    states: recovery.states,
  }, {
    validation: { expectedSha: EXPECTED_SHA, expectedRef: EXPECTED_REF, expectedPreviewUrl: PREVIEW_URL },
  });
});
