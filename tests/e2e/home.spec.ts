import { expect, test } from '@playwright/test';

test('the landing page is readable on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Cat Care');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Care starts withunderstanding.',
  );
  await expect(page.getByText('In development', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
