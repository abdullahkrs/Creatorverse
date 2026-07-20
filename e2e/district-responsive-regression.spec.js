import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { createPrototypeInvite } from '../src/prototype-invite.js';

mkdirSync('test-results/district-responsive', { recursive: true });

test.setTimeout(90_000);

const TOKEN = createPrototypeInvite({
  name: 'Nova Guild',
  theme: 'cosmic',
  promise: 'Build the signal together.',
  missionId: 'route-choice',
});
const INVITE_URL = `/#invite=${TOKEN}`;
const VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function assertLineBudget(metrics, viewport) {
  expect(metrics.playWidth, `${viewport.width}: play track must remain wider than realm context`).toBeGreaterThan(metrics.realmWidth);
  expect(metrics.layoutWidth, `${viewport.width}: result task region must retain readable inline space`).toBeGreaterThan(500);
  expect(metrics.mainWidth, `${viewport.width}: result main region must not collapse`).toBeGreaterThan(300);
  expect(metrics.titleLines, `${viewport.width}: Arabic title line budget`).toBeLessThanOrEqual(3);
  expect(metrics.supportLines, `${viewport.width}: Arabic support line budget`).toBeLessThanOrEqual(4);
  expect(metrics.districtLines, `${viewport.width}: Arabic district-name line budget`).toBeLessThanOrEqual(2);
  expect(metrics.resultHeight, `${viewport.width}: result must not become an excessive vertical strip`).toBeLessThan(viewport.height);
  expect(metrics.overflow, `${viewport.width}: no horizontal page overflow`).toBeLessThanOrEqual(1);
}

for (const viewport of VIEWPORTS) {
  test(`Arabic ${viewport.width} keeps the unlocked result readable`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    await context.addInitScript(() => {
      localStorage.setItem('creatorverse-locale', 'ar');
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => {} },
      });
    });

    const page = await context.newPage();
    await page.goto(INVITE_URL);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('[data-role="builder"]').click();
    await page.locator('[data-mission-command="sky"]').click();

    const result = page.locator('[data-mission-result]');
    await expect(result).toBeVisible();
    await expect(result.locator('#mission-result-title')).toHaveText('تم فتح الحي');
    await expect(result).toContainText('حيّ المنارة');

    const metrics = await result.evaluate(node => {
      const lineCount = selector => {
        const element = node.querySelector(selector);
        if (!element) return 0;
        const range = document.createRange();
        range.selectNodeContents(element);
        const lineTops = [...range.getClientRects()]
          .filter(rect => rect.width > 0 && rect.height > 0)
          .map(rect => Math.round(rect.top));
        return new Set(lineTops).size;
      };

      const resultBox = node.getBoundingClientRect();
      const layoutBox = node.querySelector('.signal-result-layout').getBoundingClientRect();
      const mainBox = node.querySelector('.signal-result-main').getBoundingClientRect();
      const playBox = document.querySelector('.play-panel').getBoundingClientRect();
      const realmBox = document.querySelector('.realm-panel').getBoundingClientRect();

      return {
        resultHeight: resultBox.height,
        layoutWidth: layoutBox.width,
        mainWidth: mainBox.width,
        playWidth: playBox.width,
        realmWidth: realmBox.width,
        titleLines: lineCount('#mission-result-title'),
        supportLines: lineCount('.district-unlock-support'),
        districtLines: lineCount('.district-progress-copy strong'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    assertLineBudget(metrics, viewport);

    await page.screenshot({
      path: `test-results/district-responsive/ar-${viewport.width}x${viewport.height}-unlocked.png`,
      fullPage: true,
    });

    await context.close();
  });
}
