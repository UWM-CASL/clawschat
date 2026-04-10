const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { installMockWorker } = require('./helpers/mock-engine');

async function expectNoCriticalA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function startConversation(page) {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('#messageInput')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockWorker);
  await page.goto('/');
});

test('@a11y mobile onboarding has no wcag2a/2aa violations', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start a conversation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open settings' })).toBeVisible();
  await expect(page.locator('#topBarOverflowButton')).toBeVisible();
  await expectNoCriticalA11yViolations(page);
});

test('@a11y mobile chat keeps transcript semantics and coarse status announcements', async ({
  page,
}) => {
  await startConversation(page);
  await page.locator('#messageInput').fill('Accessibility test message');
  await page.locator('#sendButton').click();
  await expect(page.locator('.message-row.model-message')).toHaveCount(1);

  await expect(page.locator('#statusRegion')).toHaveAttribute('role', 'status');
  await expect(page.locator('#statusRegion')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#chatTranscriptWrap')).toHaveAttribute(
    'aria-label',
    'Chat transcript'
  );
  await expect(page.locator('form.composer')).toHaveAttribute('aria-label', 'Message input');
  await expect(page.locator('#chatTranscript')).not.toHaveAttribute('aria-live', /.+/);
  await expectNoCriticalA11yViolations(page);
});

test('@a11y mobile settings remain keyboard reachable and violation free', async ({ page }) => {
  await startConversation(page);
  await page.getByRole('button', { name: 'Open settings' }).click();

  await expect(page).toHaveURL(/#\/chat\/settings$/);
  await expect(page.getByRole('tab', { name: 'System' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to chat' })).toBeVisible();
  await expectNoCriticalA11yViolations(page);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.getByRole('button', { name: 'Open settings' })).toBeFocused();
});
