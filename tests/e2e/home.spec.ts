import { test, expect, type APIRequestContext } from '@playwright/test';

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
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled();
  await expect(page.getByText('Coming soon — we’re working on it', { exact: true })).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
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
  const email = info.project.name === 'mobile' ? 'mobile@example.test' : 'desktop@example.test';
  const password = 'Synthetic browser password 2026!';
  await page.goto('/register');
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
  await page.getByLabel('Display name').fill('Morgan');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('profile has been updated');
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Morgan');
  await page.getByRole('button', { name: 'Security', exact: true }).click();
  await expect(page.getByText(/^This device/)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
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
