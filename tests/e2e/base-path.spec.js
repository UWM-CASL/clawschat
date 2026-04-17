const { test, expect } = require('@playwright/test');
const { installMockWorker } = require('./helpers/mock-engine');

function normalizeBasePath(pathname) {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function joinBasePath(basePath, suffix = '') {
  const normalizedBasePath = normalizeBasePath(basePath);
  const basePrefix = normalizedBasePath === '/' ? '' : normalizedBasePath;
  if (!suffix) {
    return basePrefix || '/';
  }
  return `${basePrefix}/${suffix}`;
}

async function expectLocation(page, expectedPathname, expectedHash = '') {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${normalizeBasePath(url.pathname)}${url.hash}`;
    })
    .toBe(`${normalizeBasePath(expectedPathname)}${expectedHash}`);
}

test('app navigation stays inside the configured GitHub Pages base path', async ({ page }) => {
  await page.addInitScript(installMockWorker);
  await page.goto('./');

  const initialPathname = new URL(page.url()).pathname;
  const basePath = joinBasePath(initialPathname);

  await expectLocation(page, basePath);
  await expect(page.locator('#openHelpButton')).toBeVisible();

  await page.locator('#openHelpButton').click();
  await expectLocation(page, joinBasePath(basePath, 'help.html'));
  await expect(page.getByRole('main', { name: 'ClawsChat Help' })).toBeVisible();

  await page.getByRole('link', { name: 'Open chat home' }).click();
  await expectLocation(page, basePath, '#/chat');
  await expect(page.locator('#openSettingsButton')).toBeVisible();
});
