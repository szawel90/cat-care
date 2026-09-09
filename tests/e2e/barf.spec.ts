import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3330';
const password = 'Synthetic BARF browser password 2026!';

test('creates, versions, copies and archives an owner recipe in both locales', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const email = `barf-${info.project.name}@example.test`;
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
  await page.request.get(message.Text.match(/https?:\/\/\S+/)[0]);
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/account');
  await page.getByRole('link', { name: /BARF calculator/ }).click();
  await expect(page.getByRole('heading', { name: 'BARF calculator', exact: true })).toBeVisible();
  await page.getByLabel('Recipe name', { exact: true }).fill('Synthetic chicken recipe');
  await page.getByLabel('Cat name (optional)').fill('Luna');
  await page.getByLabel('Search ingredients').fill('chicken breast');
  await page.getByLabel('Ingredient', { exact: true }).selectOption('meat-076');
  await page.getByLabel('Quantity (g)', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Search ingredients').fill('Water');
  await page.getByLabel('Ingredient', { exact: true }).selectOption('water');
  await page.getByLabel('Quantity (g)', { exact: true }).fill('300');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.barf-metrics')).toContainText('130');
  await expect(page.locator('.barf-metrics')).toContainText('10');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recipe saved');
  const recipes = await (await page.request.get('/api/account/barf/recipes')).json();
  expect(recipes).toHaveLength(1);
  const id = recipes[0].id;
  expect(recipes[0].revisions[0].snapshot.result.days).toBe(10);
  await page.reload();
  await page.getByRole('combobox', { name: 'Saved recipes', exact: true }).selectOption(id);
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Synthetic chicken recipe',
  );
  await page.getByLabel('Cat weight (kg)').fill('5');
  await page.getByRole('link', { name: 'Your account', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Cat weight (kg)')).toHaveValue('5');
  await page.route('**/api/account/barf/recipes/' + id, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Your unsaved changes are still here',
  );
  await expect(page.getByLabel('Cat weight (kg)')).toHaveValue('5');
  await page.unroute('**/api/account/barf/recipes/' + id);
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recipe saved');
  await page.getByLabel('Version history').selectOption('1');
  await expect(page.getByLabel('Cat weight (kg)')).toHaveValue('4');
  await expect(page.getByLabel('Cat weight (kg)')).toBeDisabled();
  await page.getByRole('button', { name: 'Make a copy' }).click();
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Synthetic chicken recipe — copy',
  );
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recipe saved');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Shopping list', exact: true }).click();
  const list = await download;
  expect(list.suggestedFilename()).toBe('cat-care-shopping-list.txt');
  const listText = await readFile((await list.path())!, 'utf8');
  expect(listText).toContain('Water: 300 g');
  expect(listText).toContain('Synthetic chicken recipe');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.barf-print-only')).toBeVisible();
  await expect(page.locator('.barf-print-only')).toContainText('Luna');
  await expect(page.locator('.barf-print-only')).toContainText('300 g');
  await expect(page.locator('.barf-editor')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recipe archived');
  await expect(page.getByLabel('Recipe name', { exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Saved recipes', exact: true }).selectOption(id);
  await page
    .locator('summary')
    .filter({ hasText: /^Nutrient details$/ })
    .click();
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
    await page.evaluate(async () => {
      await Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.screenshot({
    path: info.outputPath('barf-desktop-or-mobile-dark.png'),
    fullPage: true,
  });
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize(originalViewport);
  expect(
    (
      await page.request.post('/api/account/preferences', {
        headers: { origin },
        data: { languagePreference: 'pl' },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.getByRole('heading', { name: 'Kalkulator BARF', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Zapisane receptury', exact: true }).selectOption(id);
  await expect(page.getByLabel('Nazwa receptury', { exact: true })).toHaveValue(
    'Synthetic chicken recipe',
  );
  await expect(page.locator('.barf-editor button[type="submit"]')).toBeEnabled();
  await expect(page.locator('.barf-editor button[type="submit"]')).toHaveCSS('opacity', '1');
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('barf-polish-dark.png'), fullPage: true });
  // Exercise both planners on the real worker and API, after the legacy/manual journey.
  await page.getByRole('button', { name: 'Nowa receptura', exact: true }).click();
  await page.getByLabel('Nazwa receptury', { exact: true }).fill('Synthetic inventory plan');
  await page.getByLabel('Sposób układania receptury').selectOption('inventory');
  await page.locator('#barf-search').fill('Turkey breast');
  await page.locator('#barf-ingredient').selectOption('meat-041');
  await page.locator('#barf-quantity').fill('1000');
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await page.getByRole('button', { name: 'Znajdź propozycję', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zastosuj propozycję roboczą' })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Zastosuj propozycję roboczą' }).click();
  await page.getByRole('button', { name: 'Zapisz recepturę', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('zapisana');
  const planned = (await (await page.request.get('/api/account/barf/recipes')).json()).find(
    (r: { revisions: { snapshot: { input: { title: string } } }[] }) =>
      r.revisions[0].snapshot.input.title === 'Synthetic inventory plan',
  );
  expect(planned.revisions[0].snapshot.input.planning.mode).toBe('inventory');
  expect(planned.revisions[0].snapshot.planning.purchases.length).toBeLessThanOrEqual(3);
  expect(planned.revisions[0].snapshot.result.taurineZeroAssumption.ingredientIds).toContain(
    'meat-041',
  );
  await page.reload();
  await page
    .getByRole('combobox', { name: 'Zapisane receptury', exact: true })
    .selectOption(planned.id);
  await expect(page.getByText(/Założenie obliczeniowe: brakującą taurynę/).first()).toBeVisible();
  const plannerDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Lista zakupów', exact: true }).click();
  const plannedText = await readFile((await (await plannerDownload).path())!, 'utf8');
  expect(plannedText).toContain('Do dokupienia');
  expect(plannedText).toContain('Założenie obliczeniowe');
  await page.getByRole('button', { name: 'Nowa receptura', exact: true }).click();
  await page.getByLabel('Nazwa receptury', { exact: true }).fill('Synthetic food base');
  await page.getByLabel('Sposób układania receptury').selectOption('supplements');
  await page.locator('#barf-search').fill('Turkey breast');
  await page.locator('#barf-ingredient').selectOption('meat-041');
  await page.locator('#barf-quantity').fill('1000');
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await page.getByRole('button', { name: 'Znajdź propozycję', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zastosuj propozycję roboczą' })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Zastosuj propozycję roboczą' }).click();
  await page.getByRole('button', { name: 'Zapisz recepturę', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('zapisana');
  const foodRecipe = (await (await page.request.get('/api/account/barf/recipes')).json()).find(
    (r: { revisions: { snapshot: { input: { title: string } } }[] }) =>
      r.revisions[0].snapshot.input.title === 'Synthetic food base',
  );
  expect(foodRecipe.revisions[0].snapshot.input.planning.mode).toBe('supplements');
  expect(
    foodRecipe.revisions[0].snapshot.input.items.find(
      (i: { ingredientId: string }) => i.ingredientId === 'meat-041',
    ).quantity,
  ).toBe(1000);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath('barf-planner-polish-mobile.png'),
    fullPage: true,
  });
  const guest = await browser.newContext({ baseURL: origin });
  try {
    expect((await guest.request.get('/api/account/barf/recipes/' + id)).status()).toBe(401);
    const guestPage = await guest.newPage();
    await guestPage.goto('/barf');
    await expect(guestPage.getByText('Sign in to create and save your recipes.')).toBeVisible();
    await expect(guestPage.getByText('Synthetic chicken recipe')).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
