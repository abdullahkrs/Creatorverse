import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRealmCollaborationProposal } from '../src/realm-collaboration.js';

const SOURCE = { id: 'realm_source_00000001', name: 'Signal Atlas', theme: 'cosmic' };

for (const locale of [
  { id: 'en', dir: 'ltr', title: 'Create a realm first' },
  { id: 'ar', dir: 'rtl', title: 'أنشئ عالمًا أولًا' },
]) {
  test(`${locale.id} no-local-realm proposal recovery is stable and fail closed`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ localeId }) => {
      localStorage.setItem('creatorverse-locale', localeId);
      localStorage.removeItem('creatorverse-creator-ledger-v1');
      localStorage.removeItem('creatorverse-realm-collaboration-v1');
    }, { localeId: locale.id });
    const proposal = createRealmCollaborationProposal(SOURCE, {
      cryptoLike: { randomUUID: () => '12345678-1234-4234-9234-123456789abc' },
      baseUrl: `${baseURL}/`,
    });
    const page = await context.newPage();
    await page.goto(proposal.url);

    await expect(page).toHaveURL(/\/$/u);
    await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
    await expect(page.locator('body > [data-realm-collaboration]')).toHaveCount(1);
    await expect(page.locator('#realm-collaboration-error-title')).toHaveText(locale.title);
    await expect(page.locator('#realm-collaboration-error-title')).toBeFocused();
    await page.waitForTimeout(250);
    await expect(page.locator('body > [data-realm-collaboration]')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('creatorverse-realm-collaboration-v1'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('creatorverse-creator-ledger-v1'))).toBeNull();
    await expect(page.locator('body')).not.toContainText(/realm_source|proposal_|creatorverse-realm-collaboration/iu);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const action = page.locator('[data-action="create-realm-from-collaboration"]');
    const box = await action.boundingBox();
    expect(box?.width || 0).toBeGreaterThanOrEqual(44);
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await context.close();
  });
}
