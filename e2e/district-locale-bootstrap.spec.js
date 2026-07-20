import { test, expect } from '@playwright/test';
import { createPrototypeInvite } from '../src/prototype-invite.js';

function inviteToken(missionId = 'route-choice') {
  return createPrototypeInvite({
    name: 'Nova Guild',
    theme: 'cosmic',
    promise: 'Build the signal together.',
    missionId,
  });
}

const TOKEN = inviteToken();

async function completeMission(page, templateId) {
  await page.locator('[data-role="builder"]').click();
  if (templateId === 'relay-sequence') {
    for (const command of ['1', '2', '3']) {
      await page.locator(`[data-mission-command="${command}"]`).click();
    }
    return;
  }
  await page.locator(`[data-mission-command="${templateId === 'signal-match' ? 'wave' : 'sky'}"]`).click();
}

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

  await completeMission(page, 'route-choice');
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

test('each mission template announces a fresh district unlock exactly once', async ({ browser }) => {
  for (const templateId of ['route-choice', 'relay-sequence', 'signal-match']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`/#invite=${inviteToken(templateId)}`);
    await page.evaluate(() => {
      window.__districtAnnouncementCount = 0;
      const app = document.querySelector('#app');
      new MutationObserver(records => {
        for (const record of records) {
          const node = record.target.nodeType === Node.ELEMENT_NODE
            ? record.target
            : record.target.parentElement;
          const live = node?.matches?.('[data-result-announcement]')
            ? node
            : node?.closest?.('[data-result-announcement]');
          if (live?.textContent.trim()) window.__districtAnnouncementCount += 1;
        }
      }).observe(app, { childList: true, characterData: true, subtree: true });
    });

    await completeMission(page, templateId);
    await expect(page.locator('[data-mission-result]')).toBeVisible();
    await expect(page.locator('#mission-result-title')).toBeFocused();
    await page.waitForFunction(() => window.__districtAnnouncementCount >= 1);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__districtAnnouncementCount)).toBe(1);
    await context.close();
  }
});
