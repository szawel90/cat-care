import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

async function accessible(page: Page) {
  await expect(page).toHaveTitle('Cat Care');
  const google = page.getByRole('button', { name: 'Continue with Google', exact: true });
  if (await google.count()) {
    await expect(google).toBeEnabled();
    await expect(google).toHaveCSS('opacity', '1');
  }
  await expect(page.locator('[role="menu"][data-state="closed"]')).toHaveCount(0);
  const menu = page.locator('[role="menu"][data-state="open"]');
  if (await menu.count()) await expect(menu).toHaveCSS('opacity', '1');
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) await expect(dialog).toHaveCSS('opacity', '1');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })),
  ).toEqual([]);
}

async function openAccountMenu(page: Page) {
  await expect(page.locator('[role="menu"][data-state="closed"]')).toHaveCount(0);
  await page.getByRole('button', { name: /^Account menu for / }).click();
  await expect(page.getByRole('button', { name: /^Account menu for / })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('menu')).toHaveCSS('opacity', '1');
}

async function emailLink(request: APIRequestContext, email: string, subject: string) {
  let messageId = '';
  await expect
    .poll(async () => {
      const response = await request.get('http://127.0.0.1:8025/api/v1/search', {
        params: { query: `to:${email} subject:${subject}` },
      });
      const result = await response.json();
      messageId = result.messages?.[0]?.ID ?? '';
      return messageId;
    })
    .not.toBe('');
  const message = await (
    await request.get(`http://127.0.0.1:8025/api/v1/message/${messageId}`)
  ).json();
  const link = message.Text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toContain('127.0.0.1:3330');
  return link as string;
}

test('account screens are responsive, English, accessible by keyboard and ready for installation', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('link', { name: 'Cat Care home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled();
  await expect(page.getByText('Coming soon — we’re working on it', { exact: true })).toHaveCount(0);
  await page.getByLabel('Email address', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.getByLabel('Password', { exact: true }).fill('Synthetic visibility check');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'Synthetic visibility check',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await accessible(page);
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    '/favicon.svg',
  );
  const favicon = await request.get('/favicon.svg');
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
  expect((await request.get('/favicon-32.png')).status()).toBe(200);
  const ico = await request.get('/favicon.ico');
  expect(ico.status()).toBe(200);
  expect((await ico.body()).readUInt16LE(2)).toBe(1);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/account', lang: 'en' });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  const privateResponse = await request.get('/api/account');
  expect(privateResponse.status()).toBe(401);
  expect(privateResponse.headers()['cache-control']).toContain('no-store');
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
});

test('registers, verifies, signs in, edits the profile, resets a password and signs out', async ({
  page,
  request,
}, info) => {
  test.setTimeout(90_000);
  const email = info.project.name === 'mobile' ? 'mobile@example.test' : 'desktop@example.test';
  const password = 'Synthetic browser password 2026!';
  await page.goto('/register');
  await accessible(page);
  await page.getByLabel('Display name').fill('Alex');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  await page.goto(await emailLink(request, email, 'Verify'));
  await expect(page.getByRole('status')).toContainText('Your email is verified');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account.' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Account settings' })).toHaveCount(0);
  const accountMenu = page.getByRole('button', { name: /^Account menu for / });
  await accountMenu.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('menuitem', { name: 'View profile for Alex', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toBeFocused();
  await accessible(page);
  await page.screenshot({ path: info.outputPath('account-menu.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(accountMenu).toBeFocused();
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'View profile for Alex', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('tablist', { name: 'Account settings' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Cat Care home' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3330/');
  await expect(page.getByRole('heading', { name: 'A little closer, every day.' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await accessible(page);
  const tabs = page.getByRole('tablist', { name: 'Account settings' });
  const settingsHeading = page.getByRole('heading', { name: 'Settings', exact: true });
  const initialTabs = await tabs.boundingBox();
  const initialHeading = await settingsHeading.boundingBox();
  for (const name of ['Security', 'Data & privacy', 'Profile']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
    if (name === 'Security') await expect(page.getByText(/^This device/)).toBeVisible();
    const nextTabs = await tabs.boundingBox();
    const nextHeading = await settingsHeading.boundingBox();
    expect(
      Math.abs(nextTabs!.y - initialTabs!.y),
      'Settings tabs must not jump vertically',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(nextTabs!.x - initialTabs!.x),
      'Settings tabs must not jump horizontally',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(nextHeading!.y - initialHeading!.y),
      'Settings title stays in place',
    ).toBeLessThanOrEqual(1);
    await accessible(page);
    await page.screenshot({
      path: info.outputPath('settings-' + name.replaceAll(' ', '-') + '.png'),
      fullPage: true,
    });
  }
  await page.getByRole('tab', { name: 'Profile', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Security', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Profile', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tabpanel', { name: 'Security', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Display name').fill('Morgan');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('profile has been updated');
  const tabsAfterSave = await tabs.boundingBox();
  expect(
    Math.abs(tabsAfterSave!.y - initialTabs!.y),
    'Save feedback must not move the tabs',
  ).toBeLessThanOrEqual(1);
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Security', exact: true })).toBeVisible();
  const tabsAfterNotice = await tabs.boundingBox();
  expect(
    Math.abs(tabsAfterNotice!.y - initialTabs!.y),
    'Clearing feedback must not move the tabs',
  ).toBeLessThanOrEqual(1);
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Profile', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/settings=profile$/);
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Morgan');
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await expect(page.getByText(/^This device/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download data →' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Data & privacy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download data →' })).toBeVisible();
  await expect(page.getByText('Delete account', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Display name').fill('Unsaved name');
  await page.getByRole('link', { name: 'Cat Care home' }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Display name')).toHaveValue('Unsaved name');
  await expect(page).toHaveURL(/settings=profile$/);
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Display name')).toHaveValue('Unsaved name');
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/^This device/)).toBeVisible();
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('eligible account');
  await page.goto(await emailLink(request, email, 'Reset'));
  await page.getByLabel('Password', { exact: true }).fill(password + ' updated');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password + ' updated');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account.' })).toBeVisible();
});

test('short forms fit desktop windows and reflow on narrow screens', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Viewport coverage is shared across projects.');
  for (const [width, height] of [
    [1280, 720],
    [1366, 640],
    [1920, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const path of ['/login', '/register', '/forgot-password', '/reset-password']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path === '/login' && width === 1366)
        await page.screenshot({ path: info.outputPath('login-desktop.png'), fullPage: true });
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      expect(size.width, path + ' horizontal overflow').toBeLessThanOrEqual(width);
      expect(
        size.height,
        path + ' vertical overflow at ' + width + 'x' + height,
      ).toBeLessThanOrEqual(height + 1);
    }
  }
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ['/login', '/register']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await expect(
      page.getByRole('button', {
        name: path === '/login' ? 'Sign in' : 'Create account',
        exact: true,
      }),
    ).toBeVisible();
  }
});

test('home shows three sample articles to guests in both themes and reflows on mobile', async ({
  page,
  request,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await expect(page).toHaveURL('http://127.0.0.1:3330/');
    await expect(page.getByRole('heading', { name: 'A little closer, every day.' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(
      page.getByRole('article').filter({ hasText: 'Lorem ipsum dolor sit amet' }),
    ).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    for (const image of ['/article-home.svg', '/article-play.svg', '/article-rest.svg'])
      expect((await request.get(image)).status()).toBe(200);
    await accessible(page);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const cards = await page.getByRole('article').all();
  const first = await cards[0]!.boundingBox();
  const second = await cards[1]!.boundingBox();
  expect(second!.y).toBeGreaterThan(first!.y + first!.height);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
