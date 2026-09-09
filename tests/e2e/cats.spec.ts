import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import en from '../../apps/web/messages/en.json';
import pl from '../../apps/web/messages/pl.json';

const origin = 'http://127.0.0.1:3330';
const password = 'Synthetic cats password 2026!';
const labels = en.Cats;
test.use({ actionTimeout: 15_000 });
async function accessible(page: Page) {
  await expect(page).toHaveTitle('Cat Care');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
test('creates photo and name-only profiles, reuses a home, preserves observations and supports deferred answers', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const email = `cats-${info.project.name}@example.test`;
  const registration = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'Cat owner', email, password },
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
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: labels.yourCats })).toBeVisible();
  await page.getByRole('button', { name: labels.addFirst }).click();
  await page.getByLabel(labels.name, { exact: true }).fill('Luna');
  await page.getByLabel(labels.photo, { exact: true }).setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('.cat-photo-field img')).toBeVisible();
  await page.getByRole('button', { name: labels.saveCat, exact: true }).click();
  await expect(page).toHaveURL(/\/cats\/[a-f0-9-]+$/);
  const lunaId = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.locator('.cat-identity h2')).toHaveText('Luna');
  expect(await (await page.request.get(`/api/cats/${lunaId}/portrait`)).json()).toBeNull();
  expect((await page.request.get(`/api/cats/${lunaId}/photo`)).headers()['cache-control']).toBe(
    'no-store',
  );
  await accessible(page);
  await page
    .getByRole('button', { name: `${labels.edit}: ${labels.areas.household}`, exact: true })
    .click();
  await page.getByLabel(labels.fields.children).selectOption('yes');
  await page.getByLabel(labels.fields.dogs, { exact: true }).selectOption('no');
  await page.getByLabel(labels.fields.other_animals, { exact: true }).selectOption('no');
  await page.getByLabel(labels.fields.totalCats).selectOption('two');
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Luna');
  await page
    .getByRole('button', { name: `${labels.edit}: ${labels.areas.preferences}`, exact: true })
    .click();
  await page.getByLabel(labels.fields.games).fill('Rolling a soft ball');
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  const picker = page.getByRole('button', { name: /^Choose a cat:/ });
  await picker.click();
  await expect(page.getByRole('menuitem', { name: labels.addAnother })).toBeVisible();
  await page.getByRole('menuitem', { name: labels.addAnother }).click();
  await page.getByLabel(labels.name, { exact: true }).fill('Milo');
  await page.getByLabel(labels.homeChoice).selectOption(lunaId);
  await page.getByRole('button', { name: labels.saveCat, exact: true }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  const miloId = new URL(page.url()).pathname.split('/').pop()!;
  const milo = await (await page.request.get(`/api/cats/${miloId}`)).json();
  expect(milo.hasPhoto).toBe(false);
  expect(milo.attributes).toEqual({});
  expect(milo.household.facts.children).toBe('yes');
  expect(milo.household.facts.totalCats).toBe('two');
  const box = await picker.boundingBox();
  const viewport = await page.locator('body').boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - (viewport!.x + viewport!.width / 2))).toBeLessThan(2);
  await page.getByRole('button', { name: labels.startPortrait, exact: true }).click();
  await page.getByRole('button', { name: labels.start, exact: true }).click();
  await expect(page.locator('.cat-question')).toBeVisible();
  const portrait = async () => (await page.request.get(`/api/cats/${miloId}/portrait`)).json();
  expect((await portrait()).answers.Q02).toEqual(['children', 'one_cat']);
  async function answer(id: string, value: string) {
    const before = await portrait();
    const questions = labels.questionnaire.questions as Record<
      string,
      { options: Record<string, string> }
    >;
    await page
      .locator('.cat-question')
      .getByRole('radio', { name: questions[id]!.options[value], exact: true })
      .check();
    await page.getByRole('button', { name: labels.saveAndContinue, exact: true }).click();
    await expect.poll(async () => (await portrait()).revision).toBeGreaterThan(before.revision);
    await expect(page.locator('.cat-question fieldset')).toBeEnabled();
  }
  await answer('Q01', 'usual');
  await answer('Q03', 'none');
  await page.getByRole('button', { name: labels.defer, exact: true }).click();
  await expect(page.locator('.cat-question legend')).toContainText('calmly offer');
  await answer('Q05', 'almost_always');
  await page.getByRole('button', { name: labels.back, exact: true }).click();
  await expect(page.locator('.cat-pending')).toBeVisible();
  const deferred = await portrait();
  expect(deferred.answers.Q04).toBe('deferred');
  await page.locator('.cat-pending').getByRole('button', { name: labels.changeAnswer }).click();
  await page
    .locator('.cat-question')
    .getByRole('radio', { name: labels.questionnaire.questions.Q04.options.never, exact: true })
    .check();
  await page.getByRole('button', { name: labels.saveAndContinue, exact: true }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  const current = await portrait();
  expect(current.result.axes.activity.point).toBeNull();
  expect(current.result.axes.activity.range).toEqual([0, 4]);
  const old = await (
    await page.request.get(`/api/cats/${miloId}/portrait/revisions/${deferred.revision}`)
  ).json();
  expect(old.answers.Q04).toBe('deferred');
  expect(old.isCurrent).toBe(false);
  expect(old.supersededAt).not.toBeNull();
  await page.getByRole('button', { name: labels.continuePortrait, exact: true }).click();
  const choices: Record<string, string> = {
    Q06: 'rarely',
    Q07: 'rarely',
    Q08: 'often',
    Q09: 'often',
    Q10: 'often',
    Q11: 'never',
    Q12: 'often',
    Q13: 'often',
    Q14: 'sometimes',
    Q15: 'elevated',
    Q16: 'open',
    Q17: 'both',
    Q18: 'almost_always',
    F_VARIATION: 'different_contexts',
  };
  for (let count = 0; count < 16; count++) {
    const state = await portrait();
    const id = state.result.next_question?.id;
    if (!id) break;
    const value = choices[id];
    expect(value).toBeTruthy();
    await expect(page.locator('.cat-question .cat-eyebrow')).toHaveText(
      id.startsWith('F_') ? labels.clarification : 'Question ' + Number(id.slice(1)),
    );
    const before = state.revision;
    const questions = labels.questionnaire.questions as Record<
      string,
      { options: Record<string, string> }
    >;
    await page
      .locator('.cat-question')
      .getByRole('radio', { name: questions[id]!.options[value!], exact: true })
      .check();
    await page.getByRole('button', { name: labels.saveAndContinue, exact: true }).click();
    await expect.poll(async () => (await portrait()).revision).toBeGreaterThan(before);
  }
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  expect((await portrait()).result.next_question).toBeNull();
  await expect(page.locator('.cat-scale-card')).toHaveCount(9);
  await expect(page.locator('.cat-intersection')).toHaveCount(4);
  await accessible(page);
  await page.screenshot({ path: info.outputPath('cat-profile.png'), fullPage: true });
  await page.getByRole('button', { name: labels.editIdentity, exact: true }).click();
  await page.getByLabel(labels.name, { exact: true }).fill('Unsaved Milo');
  await picker.click();
  await page.getByRole('menuitem', { name: 'Luna', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: en.Unsaved.title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: en.Unsaved.keep }).click();
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue('Unsaved Milo');
  await picker.click();
  await page.getByRole('menuitem', { name: 'Luna', exact: true }).click();
  await dialog.getByRole('button', { name: en.Unsaved.discard }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Luna');
  await picker.click();
  await page.getByRole('menuitem', { name: 'Milo', exact: true }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  await page.getByRole('button', { name: labels.portraitHistory, exact: true }).click();
  await page.locator('.cat-revisions button').last().click();
  await expect(page.locator('.cat-portrait-result')).toBeVisible();
  await page.getByRole('button', { name: labels.closeHistory }).click();
  await page.getByRole('button', { name: labels.newObservation, exact: true }).click();
  await page.getByRole('button', { name: labels.start, exact: true }).click();
  await expect(page.locator('.cat-question')).toBeVisible();
  expect((await portrait()).answers).toEqual({ Q02: ['children', 'one_cat'] });
  await page.getByRole('button', { name: labels.back, exact: true }).click();
  await page.getByRole('button', { name: labels.changeHome, exact: true }).click();
  await page.getByLabel(labels.homeChoice).selectOption('');
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  expect((await (await page.request.get(`/api/cats/${miloId}`)).json()).household.id).not.toBe(
    milo.household.id,
  );
  expect((await portrait()).contextChangedAt).not.toBeNull();
  await page.getByRole('button', { name: labels.history, exact: true }).click();
  await expect(page.locator('.cat-history details').first()).toBeVisible();
  await page.locator('.cat-history details').first().locator('summary').click();
  await accessible(page);
  await page.getByRole('button', { name: labels.closeHistory }).click();
  await page.getByRole('button', { name: labels.archive, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: labels.archive, exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: labels.archivedCats }).click();
  await page
    .getByRole('region', { name: labels.archivedCats })
    .getByRole('button', { name: 'Milo' })
    .click();
  await page.getByRole('button', { name: labels.restore, exact: true }).click();
  await expect(page.getByRole('button', { name: labels.editIdentity, exact: true })).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await accessible(page);
  }
  await page.request.post('/api/account/preferences', {
    headers: { origin },
    data: { languagePreference: 'pl' },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.getByRole('button', { name: pl.Cats.editIdentity, exact: true }).click();
  await page.getByLabel(pl.Cats.name, { exact: true }).fill('Milo updated');
  await page.request.post('/api/account/preferences', {
    headers: { origin },
    data: { languagePreference: 'en' },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue('Milo updated');
  await page.route(`**/api/cats/${miloId}`, async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else await route.continue();
  });
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.locator('.cat-form').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue('Milo updated');
  await page.unroute(`**/api/cats/${miloId}`);
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo updated');
});
