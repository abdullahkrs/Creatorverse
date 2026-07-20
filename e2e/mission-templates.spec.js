import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

mkdirSync('test-results/mission-templates', { recursive: true });

test.setTimeout(90_000);

const CASES = [
  { locale: 'en', dir: 'ltr', templateId: 'route-choice', name: 'Choose a Route', district: 'Beacon District', viewport: { width: 390, height: 844 }, input: 'keyboard' },
  { locale: 'ar', dir: 'rtl', templateId: 'route-choice', name: 'اختر مسارًا', district: 'حيّ المنارة', viewport: { width: 320, height: 568 }, input: 'touch' },
  { locale: 'en', dir: 'ltr', templateId: 'relay-sequence', name: 'Link the Relays', district: 'Beacon District', viewport: { width: 768, height: 1024 }, input: 'touch' },
  { locale: 'ar', dir: 'rtl', templateId: 'relay-sequence', name: 'اربط المرحّلات', district: 'حيّ المنارة', viewport: { width: 1024, height: 768 }, input: 'keyboard' },
  { locale: 'en', dir: 'ltr', templateId: 'signal-match', name: 'Match the Signal', district: 'Beacon District', viewport: { width: 1440, height: 900 }, input: 'keyboard' },
  { locale: 'ar', dir: 'rtl', templateId: 'signal-match', name: 'طابق الإشارة', district: 'حيّ المنارة', viewport: { width: 390, height: 844 }, input: 'touch' },
];

async function createContext(browser, testCase) {
  const context = await browser.newContext({
    viewport: testCase.viewport,
    hasTouch: testCase.input === 'touch',
    isMobile: testCase.input === 'touch',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(locale => {
    localStorage.setItem('creatorverse-locale', locale);
    window.__missionTemplateClipboard = '';
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__missionTemplateClipboard = String(value); } },
    });
  }, testCase.locale);
  return context;
}

async function expectQuality(page, testCase, label) {
  await expect(page.locator('html')).toHaveAttribute('lang', testCase.locale);
  await expect(page.locator('html')).toHaveAttribute('dir', testCase.dir);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);

  const targets = await page.locator('button:visible:not([disabled])').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { label: node.getAttribute('aria-label') || node.textContent?.trim() || '', width: rect.width, height: rect.height };
  }));
  for (const target of targets) {
    expect(target.label).not.toBe('');
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact)), label).toEqual([]);
}

async function captureState(page, testCase, state) {
  await page.screenshot({
    path: `test-results/mission-templates/${testCase.locale}-${testCase.templateId}-${testCase.viewport.width}x${testCase.viewport.height}-${state}.png`,
    fullPage: true,
  });
}

async function activate(page, selector, input, { radio = false } = {}) {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  if (input === 'keyboard') {
    await target.focus();
    await page.keyboard.press(radio ? 'Space' : 'Enter');
  } else if (radio) {
    await target.check();
  } else {
    await target.click();
  }
}

async function buildInvite(page, testCase) {
  await page.goto('/');
  await page.locator('[data-action="creator"]').click();
  await page.locator('[data-action="creator-next"]').click();
  await page.locator('[data-action="creator-next"]').click();

  const selector = page.locator('.mission-template-selector');
  await expect(selector).toBeVisible();
  await expect(selector.locator('input[name="mission-template"]')).toHaveCount(3);
  await expect(page.locator('[data-action="creator-next"]')).toBeDisabled();
  await activate(page, `input[name="mission-template"][value="${testCase.templateId}"]`, testCase.input, { radio: true });
  await expect(page.locator(`input[name="mission-template"][value="${testCase.templateId}"]`)).toBeChecked();
  await expect(page.locator('[data-action="creator-next"]')).toBeEnabled();
  await expectQuality(page, testCase, `${testCase.locale} ${testCase.templateId} selector`);
  await captureState(page, testCase, 'creator-selection');

  await page.locator('[data-action="creator-next"]').click();
  await expect(page.locator('[data-prototype-invite-receipt]')).toBeVisible();
  await expect(page.locator('[data-mission-receipt]')).toContainText(testCase.name);
  await page.locator('[data-action="copy-prototype-invite"]').click();
  const invite = await page.evaluate(() => window.__missionTemplateClipboard);
  expect(invite).toContain('#invite=v1.');
  return invite;
}

async function completeTemplate(page, testCase) {
  await activate(page, '[data-role="builder"]', testCase.input);
  await expect(page.locator('.mission')).toHaveAttribute('data-mission-template', testCase.templateId);
  await expect(page.locator('#mission-title')).toContainText(testCase.name);
  const locked = page.locator('[data-district-progress]');
  await expect(locked).toHaveAttribute('data-district-state', 'locked');
  await expect(locked).toHaveAttribute('aria-valuenow', '0');
  await expect(locked).toContainText(testCase.district);
  await expectQuality(page, testCase, `${testCase.locale} ${testCase.templateId} ready`);
  await captureState(page, testCase, 'follower-ready');

  if (testCase.templateId === 'route-choice') {
    await activate(page, '[data-mission-command="sky"]', testCase.input);
  } else if (testCase.templateId === 'relay-sequence') {
    await expect(page.locator('[data-mission-command="2"]')).toBeDisabled();
    await activate(page, '[data-mission-command="1"]', testCase.input);
    await expect(page.locator('[data-mission-command="2"]')).toBeEnabled();
    await activate(page, '[data-mission-command="2"]', testCase.input);
    await expect(page.locator('[data-mission-command="3"]')).toBeEnabled();
    await activate(page, '[data-mission-command="3"]', testCase.input);
  } else {
    const mismatch = page.locator('[data-mission-command="pulse"]');
    await activate(page, '[data-mission-command="pulse"]', testCase.input);
    await expect(page.locator('[data-mission-result]')).toHaveCount(0);
    await expect(page.locator('.mission-template-message')).not.toBeEmpty();
    await expect(mismatch).toBeFocused();
    await activate(page, '[data-mission-command="wave"]', testCase.input);
  }

  const result = page.locator('[data-mission-result]');
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-mission-template', testCase.templateId);
  await expect(result.locator('.signal-result-facts')).toContainText(testCase.name);
  await expect(result.locator('[data-district-progress]')).toHaveAttribute('data-district-state', 'unlocked');
  await expect(result.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '3');
  await expect(result.locator('[data-district-progress]')).toContainText(testCase.district);
  await expect(result.locator('.signal-contribution')).toContainText('+3');
  await expectQuality(page, testCase, `${testCase.locale} ${testCase.templateId} result`);
  await captureState(page, testCase, 'completed-result');

  await page.locator('[data-action="mission-result-action"]').click();
  const shared = await page.evaluate(() => window.__missionTemplateClipboard);
  expect(shared).toContain(testCase.name);
  expect(shared).toContain(testCase.district);
}

for (const testCase of CASES) {
  test(`${testCase.locale} ${testCase.templateId} stays bounded from selector to one district unlock`, async ({ browser }) => {
    const creatorContext = await createContext(browser, testCase);
    const creator = await creatorContext.newPage();
    const invite = await buildInvite(creator, testCase);
    await creatorContext.close();

    const followerContext = await createContext(browser, testCase);
    const follower = await followerContext.newPage();
    await follower.goto(invite);
    await expect(follower.locator('[data-prototype-follower-entry]')).toBeVisible();
    await completeTemplate(follower, testCase);
    await followerContext.close();
  });
}
