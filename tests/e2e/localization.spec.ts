import { type BrowserContext, type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { languageFromHeader, matchLanguage, resolveLanguage } from '../../apps/web/src/lib/locale';
import { authErrorKey, catalogs } from '../../apps/web/src/i18n/messages';

test.use({ locale: 'pl-PL' });
const origin = 'http://127.0.0.1:3330';
const password = 'Synthetic language password 2026!';

async function signIn(context: BrowserContext, email: string) {
  expect(
    (
      await context.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
}

async function accessible(page: Page) {
  await expect(page).toHaveTitle('Cat Care');
  const google = page.getByRole('button', { name: 'Kontynuuj z Google', exact: true });
  if (await google.count()) {
    await expect(google).toBeEnabled();
    await expect(google).toHaveCSS('opacity', '1');
  }
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) await expect(dialog).toHaveCSS('opacity', '1');
  // The second-device scenario can leave this page in the background.
  await page.bringToFront();
  await expect
    .poll(
      () =>
        page
          .locator('body')
          .evaluate(
            (body) =>
              body
                .getAnimations({ subtree: true })
                .filter(
                  (animation) =>
                    animation.playState === 'running' &&
                    Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
                ).length,
          ),
      { message: 'Finite UI transitions should settle before contrast measurement' },
    )
    .toBe(0);
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

test('matches browser language priorities and keeps both catalogs complete', () => {
  expect(languageFromHeader('de-DE,pl-PL;q=0.9,en-US;q=0.8')).toBe('pl');
  expect(languageFromHeader('pl;q=0.3,en-GB;q=0.9')).toBe('en');
  expect(languageFromHeader('pl;q=0,en;q=0.8')).toBe('en');
  expect(languageFromHeader('pl;q=broken,en;q=0.5')).toBe('en');
  expect(languageFromHeader(null)).toBe('en');
  expect(matchLanguage(['de-DE', 'PL-pl', 'en'])).toBe('pl');
  expect(matchLanguage(['<script>', 'fr-FR'])).toBe('en');
  expect(resolveLanguage('en', 'pl')).toBe('en');
  expect(resolveLanguage('system', 'pl')).toBe('pl');
  expect(
    authErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'private backend details' }),
  ).toBe('invalidCredentials');
  expect(authErrorKey({ message: 'unexpected private backend details' })).toBe('genericError');
  for (const namespace of Object.keys(catalogs.en) as (keyof typeof catalogs.en)[]) {
    const english = catalogs.en[namespace];
    const polish = catalogs.pl[namespace];
    expect(Object.keys(polish).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(english)) {
      const translated = (polish as Record<string, string>)[key]!;
      expect(translated.trim()).not.toBe('');
      // Interpolated values and rich-text elements must survive translation.
      const parameters = (text: string) =>
        [...text.matchAll(/\{(\w+)[,}]|<(\w+)>/g)].map((match) => match[1] ?? match[2]).sort();
      expect(parameters(translated)).toEqual(parameters(value));
    }
  }
});

test('renders Polish before JavaScript and lets guests switch without losing form input', async ({
  browser,
  page,
}, info) => {
  const noScript = await browser.newContext({
    baseURL: origin,
    javaScriptEnabled: false,
    locale: 'pl-PL',
  });
  try {
    const initial = await noScript.newPage();
    await initial.goto('/');
    await expect(initial.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(
      initial.getByRole('heading', { name: 'Każdego dnia trochę bliżej.' }),
    ).toBeVisible();
    await expect(initial.getByRole('article')).toHaveCount(3);
    for (const title of [
      'Miejsce, w którym czujesz się u siebie',
      'Chwila na zabawę',
      'Sztuka zwalniania tempa',
    ])
      await expect(initial.getByRole('heading', { name: title, exact: true })).toBeVisible();
  } finally {
    await noScript.close();
  }
  const unsupported = await page.request.get('/', {
    headers: { 'Accept-Language': 'de-DE,de;q=0.9' },
  });
  expect(await unsupported.text()).toMatch(/<html[^>]+lang="en"/);
  for (const payload of [
    { languagePreference: 'de' },
    {},
    { languagePreference: null },
    { languagePreference: 'pl', extra: true },
  ]) {
    expect(
      (await page.request.post('/api/locale', { headers: { origin }, data: payload })).status(),
    ).toBe(400);
  }
  expect(
    (
      await page.request.post('/api/locale', {
        headers: { origin: 'https://untrusted.example' },
        data: { languagePreference: 'en' },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.getByLabel('Adres e-mail', { exact: true }).fill('guest@example.test');
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await expect(page.getByRole('combobox', { name: 'Język interfejsu' })).toBeEnabled();
  await page.getByRole('combobox').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('guest@example.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(password);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox')).toBeEnabled();
  await page.getByRole('combobox').selectOption('pl');
  await expect(page.getByRole('heading', { name: 'Dobrze Cię widzieć.' })).toBeVisible();
  await page.getByLabel('Adres e-mail', { exact: true }).fill('guest@example.test');
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Nieprawidłowy adres e-mail lub hasło.',
  );
  for (const [path, heading] of [
    ['/register', 'Poczuj się jak u siebie.'],
    ['/forgot-password', 'Nie pamiętasz swojego hasła?'],
    ['/reset-password', 'Czas na nowe hasło.'],
    ['/missing-page', 'Nie znaleziono tej strony.'],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible();
    await accessible(page);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Każdego dnia trochę bliżej.' })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: info.outputPath('home-polish.png'), fullPage: true });
  await page.getByRole('combobox').selectOption('en');
  await expect(page.getByRole('heading', { name: 'A little closer, every day.' })).toBeVisible();
  for (const title of [
    'A place to feel at home',
    'A little time to play',
    'The art of slowing down',
  ])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('combobox').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.getByRole('heading', { name: 'Każdego dnia trochę bliżej.' })).toBeVisible();
});

test('saves account language across devices independently of theme and unsaved profile edits', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const email = `language-${info.project.name}@example.test`;
  // The separate guest preference must survive account sign-in and sign-out.
  expect(
    (
      await page.request.post('/api/locale', {
        headers: { origin },
        data: { languagePreference: 'en' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin, 'x-cat-care-locale': 'pl' },
        data: { name: 'Alex', email, password },
      })
    ).status(),
  ).toBe(200);
  let messageId = '';
  await expect
    .poll(async () => {
      const response = await page.request.get('http://127.0.0.1:8025/api/v1/search', {
        params: { query: `to:${email} subject:Potwierdź` },
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
  await page.goto('/account?settings=profile');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  const language = page.locator('.language-settings');
  await expect(language.getByRole('radio', { name: 'Automatycznie', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Ciemny', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Nazwa wyświetlana').fill('Unsaved language profile');
  let releaseSnapshot = () => {};
  let snapshotReady = false;
  const snapshotGate = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  await page.route('**/account?*', async (route) => {
    if (route.request().headers().rsc !== '1' || snapshotReady) return route.continue();
    const response = await route.fetch();
    snapshotReady = true;
    await snapshotGate;
    await route.fulfill({ response });
  });
  try {
    await language.getByRole('radio', { name: 'English', exact: true }).click();
    await expect(language.getByRole('status')).toHaveText('Language saved.');
    await expect.poll(() => snapshotReady).toBe(true);
    await page.getByRole('radio', { name: 'Light', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Appearance', exact: true }).getByRole('status'),
    ).toHaveText('Appearance saved.');
    releaseSnapshot();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'A thoughtful space for you and your cat.',
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  } finally {
    releaseSnapshot();
    await page.unroute('**/account?*');
  }
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Appearance', exact: true }).getByRole('status'),
  ).toHaveText('Appearance saved.');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Display name')).toHaveValue('Unsaved language profile');
  expect(await (await page.request.get('/api/account/preferences')).json()).toEqual({
    languagePreference: 'en',
    themePreference: 'dark',
  });
  expect(await (await page.request.get('/account')).text()).toMatch(/<html[^>]+lang="en"/);
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Display name')).toHaveValue('Unsaved language profile');
  const otherDevice = await browser.newContext({ baseURL: origin, locale: 'pl-PL' });
  try {
    await signIn(otherDevice, email);
    const other = await otherDevice.newPage();
    await other.goto('/account?settings=profile');
    await expect(other.locator('html')).toHaveAttribute('lang', 'en');
    await expect(other.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
    await other.getByRole('radio', { name: 'Polski', exact: true }).click();
    await expect(other.locator('.language-settings').getByRole('status')).toHaveText(
      'Zapisano język.',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.getByLabel('Nazwa wyświetlana')).toHaveValue('Unsaved language profile');
  } finally {
    await otherDevice.close();
  }
  await page.route('**/api/account/preferences', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else await route.continue();
  });
  await language.getByRole('radio', { name: 'English', exact: true }).click();
  await expect(language.getByRole('alert')).toContainText('Nie udało się zapisać języka.');
  await expect(language.getByRole('radio', { name: 'Polski', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.unroute('**/api/account/preferences');
  await language.getByRole('radio', { name: 'Automatycznie', exact: true }).click();
  await expect(language.getByRole('status')).toHaveText('Zapisano język.');
  expect(await (await page.request.get('/api/account/preferences')).json()).toEqual({
    languagePreference: 'system',
    themePreference: 'dark',
  });
  await page.getByRole('tab', { name: 'Bezpieczeństwo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Niezapisane zmiany' })).toBeVisible();
  await accessible(page);
  await page.getByRole('button', { name: 'Odrzuć zmiany', exact: true }).click();
  for (const tab of ['Bezpieczeństwo', 'Dane i prywatność', 'Profil']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: tab, exact: true })).toBeVisible();
    if (tab === 'Bezpieczeństwo') await expect(page.getByText(/^To urządzenie/)).toBeVisible();
    await accessible(page);
  }
  await page.screenshot({ path: info.outputPath('settings-polish-dark.png'), fullPage: true });
  await page.getByRole('radio', { name: 'Jasny', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await accessible(page);
  await page.screenshot({ path: info.outputPath('settings-polish-light.png'), fullPage: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      await language.locator('label').evaluateAll((labels) =>
        labels.every((label) => {
          const caption = label.querySelector('span > span')!;
          const text = caption.getBoundingClientRect();
          const control = label.getBoundingClientRect();
          return text.left >= control.left && text.right <= control.right;
        }),
      ),
    ).toBe(true);
  }
  await language.getByRole('radio', { name: 'Polski', exact: true }).click();
  await expect(language.getByRole('status')).toHaveText('Zapisano język.');
  await page.getByRole('button', { name: /^Menu konta:/ }).click();
  await page.getByRole('menuitem', { name: 'Wyloguj się', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox')).toHaveValue('en');
  await signIn(page.context(), email);
  await page.goto('/account?settings=profile');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(language.getByRole('radio', { name: 'Polski', exact: true })).toBeChecked();
});
