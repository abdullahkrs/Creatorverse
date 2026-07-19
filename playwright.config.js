import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
const usabilityProxyIdentity = [
  process.env.USABILITY_PROXY_SHA,
  process.env.USABILITY_PROXY_REF,
  process.env.USABILITY_PROXY_URL,
];
const hasAnyUsabilityProxyIdentity = usabilityProxyIdentity.some(Boolean);
const hasCompleteUsabilityProxyIdentity = usabilityProxyIdentity.every(Boolean);

if (hasAnyUsabilityProxyIdentity && !hasCompleteUsabilityProxyIdentity) {
  throw new Error('USABILITY_PROXY_SHA, USABILITY_PROXY_REF, and USABILITY_PROXY_URL must be provided together.');
}

export default defineConfig({
  testDir: './e2e',
  testIgnore: hasCompleteUsabilityProxyIdentity ? [] : ['usability-proxy.spec.js'],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
