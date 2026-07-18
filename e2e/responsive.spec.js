import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { getMissionResultCopy } from '../src/mission-result-i18n.js';

mkdirSync('test-results/screenshots', { recursive: true });

const viewports = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
];

const textZoomViewports = viewports.slice(0, 2);
const localeDirection = { en: 'ltr', ar: 'rtl' };

async function setInitialLocale(page, locale) {
  await page.addInitScript(value => {
    if (!localStorage.getItem('creatorverse-locale')) localStorage.setItem('creatorverse-locale', value);
  }, locale);
}

async function completeMission(page, { role = 'builder', route = 'sky' } = {}) {
  await page.locator(`[data-role="${role}"]`).click();
  await page.locator(`[data-route="${route}"]`).click();
  await expect(page.locator('[data-mission-result]')).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectTouchTargets(page) {
  const targets = await page.locator('button:visible').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { label: node.getAttribute('aria-label') || node.textContent?.trim() || 'button', width: rect.width, height: rect.height };
  }));

  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
}

async function expectVisibleFocus(page, locator) {
  await locator.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(locator).toBeFocused();
  const focus = await locator.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      focusVisible: node.matches(':focus-visible'),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focus.focusVisible).toBe(true);
  expect(focus.style).not.toBe('none');
  expect(focus.width).toBeGreaterThan(0);
}

async function expectNaturalWrapping(locator, label) {
  const metrics = await locator.evaluate(node => {
    const text = node.textContent?.trim().replace(/\s+/gu, ' ') || '';
    const range = document.createRange();
    range.selectNodeContents(node);
    const lineTops = new Set(
      [...range.getClientRects()]
        .filter(rect => rect.width > 0 && rect.height > 0)
        .map(rect => Math.round(rect.top)),
    );
    const style = getComputedStyle(node);
    return {
      text,
      lineCount: lineTops.size,
      wordCount: text.split(/\s+/u).filter(Boolean).length,
      wordBreak: style.wordBreak,
    };
  });

  expect(metrics.text, `${label} text`).not.toBe('');
  expect(metrics.wordBreak, `${label} word-break`).not.toBe('break-all');
  expect(metrics.lineCount, `${label} natural line count`).toBeLessThanOrEqual(Math.max(1, metrics.wordCount));
}

for (const locale of ['en', 'ar']) {
  for (const viewport of viewports) {
    test(`${locale} ${viewport.name} captures role-ready and result-ready evidence`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setInitialLocale(page, locale);
      await page.goto('/');

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', localeDirection[locale]);
      await expect(page.locator('[data-mission-result]')).toHaveCount(0);

      const roles = page.locator('.experience [data-role]');
      await expect(roles).toHaveCount(3);
      expect(await page.locator('.experience [data-role]:enabled').count()).toBe(3);
      expect(await page.locator('.experience [data-route]:enabled').count()).toBe(0);
      await expect(roles.first()).toBeVisible();
      await expectVisibleFocus(page, roles.first());
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);

      await page.screenshot({ path: `test-results/screenshots/${locale}-${viewport.name}-role-ready.png` });

      await completeMission(page);
      const result = page.locator('[data-mission-result]');
      const resultAction = result.locator('[data-action="mission-result-action"]');
      await expect(result.locator('.signal-result-facts > div')).toHaveCount(4);
      await expect(result.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '75');
      await expect(result.locator('#mission-result-action-status')).toHaveAttribute('aria-live', 'polite');
      await expect(result.locator('[data-result-announcement]')).toHaveAttribute('aria-live', 'polite');
      await expect(resultAction).toBeVisible();
      await resultAction.scrollIntoViewIfNeeded();
      await expectVisibleFocus(page, resultAction);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);

      await page.screenshot({ path: `test-results/screenshots/${locale}-${viewport.name}-result-ready.png` });
    });
  }
}

for (const locale of ['en', 'ar']) {
  for (const viewport of textZoomViewports) {
    test(`${locale} ${viewport.name} remains usable at 200 percent text zoom`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setInitialLocale(page, locale);
      await page.goto('/');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

      const roles = page.locator('.experience [data-role]');
      await expect(roles).toHaveCount(3);
      await expectNoHorizontalOverflow(page);
      for (let index = 0; index < await roles.count(); index += 1) {
        const role = roles.nth(index);
        await role.scrollIntoViewIfNeeded();
        await expect(role).toBeVisible();
        await expectNaturalWrapping(role.locator('.role-copy strong'), `${locale} role ${index + 1}`);
        await expectVisibleFocus(page, role);
      }
      await expectTouchTargets(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `test-results/screenshots/${locale}-${viewport.name}-200pct-role-ready.png`,
        fullPage: true,
      });

      await completeMission(page);
      const result = page.locator('[data-mission-result]');
      const facts = result.locator('.signal-result-facts dd');
      await expect(facts).toHaveCount(4);
      for (let index = 0; index < await facts.count(); index += 1) {
        await expectNaturalWrapping(facts.nth(index), `${locale} result fact ${index + 1}`);
      }

      const action = result.locator('[data-action="mission-result-action"]');
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeVisible();
      await expectVisibleFocus(page, action);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `test-results/screenshots/${locale}-${viewport.name}-200pct-result-ready.png`,
        fullPage: true,
      });
    });
  }
}

for (const locale of ['en', 'ar']) {
  test(`${locale} preserves the completed result after resize and language switching`, async ({ page }) => {
    const targetLocale = locale === 'en' ? 'ar' : 'en';
    await page.setViewportSize({ width: 390, height: 844 });
    await setInitialLocale(page, locale);
    await page.goto('/');
    await completeMission(page, { role: 'explorer', route: 'ocean' });

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('[data-role="explorer"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-mission-result]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-mission-result]')).toBeVisible();

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator(`[data-locale="${targetLocale}"]`).click(),
    ]);

    await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
    await expect(page.locator('html')).toHaveAttribute('dir', localeDirection[targetLocale]);
    await expect(page.locator('[data-role="explorer"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-mission-result]')).toBeVisible();
    await expect(page.locator('.signal-result-facts > div')).toHaveCount(4);
  });
}

for (const locale of ['en', 'ar']) {
  test(`${locale} share action exposes loading, failure, retry, and success`, async ({ page }) => {
    const copy = getMissionResultCopy(locale);
    await setInitialLocale(page, locale);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: () => new Promise((resolve, reject) => {
          window.__shareAttempt = (window.__shareAttempt || 0) + 1;
          window.__settleShare = window.__shareAttempt === 1
            ? () => reject(new Error('CONTROLLED_SHARE_FAILURE'))
            : () => resolve();
        }),
      });
    });
    await page.goto('/');
    await completeMission(page);

    const action = page.locator('[data-action="mission-result-action"]');
    const status = page.locator('#mission-result-action-status');
    await action.click();
    await expect(action).toBeDisabled();
    await expect(action).toContainText(copy.sharing);
    await page.evaluate(() => window.__settleShare());
    await expect(status).toHaveText(copy.shareFailed);
    await expect(action).toBeEnabled();
    await expect(action).toBeFocused();

    await action.click();
    await expect(action).toBeDisabled();
    await page.evaluate(() => window.__settleShare());
    await expect(action).toContainText(copy.shared);
    await expect(status).toHaveText(copy.shareSuccess);
  });

  test(`${locale} copy fallback completes without external posting`, async ({ page }) => {
    const copy = getMissionResultCopy(locale);
    await setInitialLocale(page, locale);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async text => { window.__copiedMissionResult = text; } },
      });
    });
    await page.goto('/');
    await completeMission(page);

    const action = page.locator('[data-action="mission-result-action"]');
    await action.click();
    await expect(action).toContainText(copy.copied);
    await expect(page.locator('#mission-result-action-status')).toHaveText(copy.copySuccess);
    expect(await page.evaluate(() => window.__copiedMissionResult)).toContain(page.url());
  });
}

test('keyboard mission result flow remains predictable', async ({ page }) => {
  await page.goto('/');
  const role = page.locator('[data-role="builder"]');
  await expectVisibleFocus(page, role);
  await page.keyboard.press('Enter');
  const route = page.locator('[data-route="sky"]');
  await expectVisibleFocus(page, route);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-mission-result]')).toBeVisible();
  await expect(page.locator('[data-action="mission-result-action"]')).toBeVisible();
});

test('reduced motion disables purposeful progress animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.locator('.progress span').evaluate(node => getComputedStyle(node).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
});
