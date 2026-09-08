import { type BrowserContext, type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3330';
const password = 'Synthetic appearance password 2026!';

async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post('/api/auth/sign-in/email', {
    headers: { origin },
    data: { email, password },
  });
  expect(response.status()).toBe(200);
}

async function accessible(page: Page) {
  await expect(page).toHaveTitle('Cat Care');
  const google = page.getByRole('button', { name: 'Continue with Google', exact: true });
  if (await google.count()) {
    await expect(google).toBeEnabled();
    await expect(google).toHaveCSS('opacity', '1');
  }
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) await expect(dialog).toHaveCSS('opacity', '1');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })),
  ).toEqual([]);
}

test('system theme renders without JavaScript and follows device changes', async ({
  browser,
  page,
}) => {
  const noScript = await browser.newContext({
    baseURL: origin,
    javaScriptEnabled: false,
    colorScheme: 'dark',
  });
  try {
    const initial = await noScript.newPage();
    await initial.goto('/login');
    await expect(initial.locator('html')).toHaveAttribute('data-theme', 'system');
    await expect(initial.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(initial.locator('body')).toHaveCSS('background-color', 'rgb(22, 22, 22)');
  } finally {
    await noScript.close();
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await accessible(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('persists appearance across devices, restores System and handles failed saves accessibly', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const email = `appearance-${info.project.name}@example.test`;
  const registration = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'Alex', email, password },
  });
  expect(registration.status()).toBe(200);
  let messageId = '';
  await expect
    .poll(async () => {
      const response = await page.request.get('http://127.0.0.1:8025/api/v1/search', {
        params: { query: `to:${email} subject:Verify` },
      });
      messageId = (await response.json()).messages?.[0]?.ID ?? '';
      return messageId;
    })
    .not.toBe('');
  const message = await (
    await page.request.get(`http://127.0.0.1:8025/api/v1/message/${messageId}`)
  ).json();
  const verification = message.Text.match(/https?:\/\/\S+/)?.[0];
  expect(verification).toContain(origin);
  await page.request.get(verification);
  await signIn(page.context(), email);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/account?settings=profile');
  const appearance = page.getByRole('region', { name: 'Appearance', exact: true });
  const system = appearance.getByRole('radio', { name: 'System', exact: true });
  const light = appearance.getByRole('radio', { name: 'Light', exact: true });
  const dark = appearance.getByRole('radio', { name: 'Dark', exact: true });
  await expect(system).toBeEnabled();
  await expect(system).toBeChecked();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await dark.click();
  await expect(appearance.getByRole('status')).toHaveText('Appearance saved.');
  await expect(dark).toBeChecked();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  expect((await (await page.request.get('/api/account/preferences')).json()).themePreference).toBe(
    'dark',
  );
  await page.reload();
  await expect(dark).toBeChecked();
  await expect(dark).toBeEnabled();
  const serverHtml = await (await page.request.get('/account?settings=profile')).text();
  expect(serverHtml).toContain('data-theme="dark"');
  await accessible(page);
  await page.screenshot({ path: info.outputPath('appearance-dark.png'), fullPage: true });
  for (const name of ['Security', 'Data & privacy', 'Profile']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
    if (name === 'Security') await expect(page.getByText(/^This device/)).toBeVisible();
    await accessible(page);
  }

  const otherDevice = await browser.newContext({ baseURL: origin, colorScheme: 'light' });
  try {
    await signIn(otherDevice, email);
    const otherPage = await otherDevice.newPage();
    await otherPage.goto('/account?settings=profile');
    await expect(otherPage.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
    await expect(otherPage.locator('html')).toHaveCSS('color-scheme', 'dark');
    await otherPage.getByRole('radio', { name: 'Light', exact: true }).click();
    await expect(
      otherPage.getByRole('region', { name: 'Appearance' }).getByRole('status'),
    ).toHaveText('Appearance saved.');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(light).toBeChecked();
  } finally {
    await otherDevice.close();
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await accessible(page);
  await page.screenshot({ path: info.outputPath('appearance-light.png'), fullPage: true });

  await page.route('**/api/account/preferences', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else await route.continue();
  });
  await dark.click();
  await expect(appearance.getByRole('alert')).toContainText('Could not save');
  await expect(light).toBeChecked();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  expect((await (await page.request.get('/api/account/preferences')).json()).themePreference).toBe(
    'light',
  );
  await page.unroute('**/api/account/preferences');
  await system.click();
  await expect(system).toBeChecked();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  expect((await (await page.request.get('/api/account/preferences')).json()).themePreference).toBe(
    'system',
  );

  await page.getByLabel('Display name').fill('Unsaved profile');
  await dark.click();
  await expect(dark).toBeChecked();
  await expect(appearance.getByRole('status')).toHaveText('Appearance saved.');
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await accessible(page);
  await page.screenshot({ path: info.outputPath('unsaved-changes-dark.png'), fullPage: true });
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Discard changes', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Display name')).toHaveValue('Unsaved profile');
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: /^Account menu for / }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await signIn(page.context(), email);
  await page.goto('/account?settings=profile');
  await expect(dark).toBeChecked();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  // Theme labels stay on one line and inside their controls on common phone widths.
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 844 });
    const labelsFit = await appearance.locator('label').evaluateAll((labels) =>
      labels.every((label) => {
        const caption = label.querySelector('span')!;
        const text = Array.from(caption.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE,
        )!;
        const range = document.createRange();
        range.selectNodeContents(text);
        const textRect = range.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        return (
          range.getClientRects().length === 1 &&
          textRect.left >= labelRect.left &&
          textRect.right <= labelRect.right
        );
      }),
    );
    expect(labelsFit).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(system).toBeVisible();
  await accessible(page);
});
