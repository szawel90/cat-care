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
  await page
    .getByRole('group', { name: labels.fields.games, exact: true })
    .getByRole('checkbox', { name: labels.choiceLabels.balls, exact: true })
    .check();
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
  const questions = labels.questionnaire.questions as Record<
    string,
    { text: string; options: Record<string, string> }
  >;
  async function answer(id: string, value: string) {
    const before = await portrait();
    await page
      .locator('.cat-question')
      .getByRole('button', { name: questions[id]!.options[value], exact: true })
      .click();
    await expect.poll(async () => (await portrait()).revision).toBeGreaterThan(before.revision);
  }
  await answer('Q01', 'usual');
  await answer('Q03', 'none');
  await page.getByRole('button', { name: labels.defer }).click();
  await expect(page.locator('.cat-question-title')).toHaveText(questions.Q05!.text);
  await answer('Q05', 'joins_play');
  await expect(page.locator('.cat-question-title')).toHaveText(questions.Q06!.text);
  await expect(page.locator('.cat-question-title')).toBeFocused();
  const position = await page.locator('.cat-question-title').boundingBox();
  expect(position!.y).toBeGreaterThanOrEqual(0);
  expect(position!.y).toBeLessThan(100);
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 844 });
  await accessible(page);
  await answer('Q06', 'rests');
  await page.getByRole('button', { name: labels.defer }).click();
  await expect(page.locator('.cat-question-title')).toHaveText(questions.Q08!.text);
  const choices: Record<string, string> = {
    Q08: 'approaches_contact',
    Q09: 'close',
    Q10: 'initiates_greeting',
    Q11: 'stays',
    Q12: 'investigates',
    Q13: 'explores',
    Q14: 'brief_sniff',
    Q15: 'elevated',
    Q16: 'open',
    Q17: 'both',
    Q18: 'settles',
  };
  for (let count = 0; count < 14; count++) {
    const state = await portrait();
    const id = state.result.next_question?.id;
    if (!id) break;
    expect(choices[id]).toBeTruthy();
    await answer(id, choices[id]!);
  }
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  const deferred = await portrait();
  expect(deferred.result.pending.map((item: { id: string }) => item.id)).toEqual(['Q04', 'Q07']);
  await page.getByRole('button', { name: labels.continuePortrait, exact: true }).click();
  await expect(page.locator('.cat-question-title')).toHaveText(questions.Q04!.text);
  // A failed save stays on the same question and can be retried.
  await page.route(`**/api/cats/${miloId}/portrait`, async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else await route.continue();
  });
  await page.getByRole('button', { name: questions.Q04!.options.often, exact: true }).click();
  await expect(page.locator('.cat-question').getByRole('alert')).toBeVisible();
  await expect(page.locator('.cat-question-title')).toHaveText(questions.Q04!.text);
  await page.unroute(`**/api/cats/${miloId}/portrait`);
  await answer('Q04', 'often');
  // Regression: continuation must skip answered Q05 and Q06.
  await expect(page.locator('.cat-question-title')).toHaveText(questions.Q07!.text);
  await answer('Q07', 'continues');
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  expect((await portrait()).result.pending).toEqual([]);
  const old = await (
    await page.request.get(`/api/cats/${miloId}/portrait/revisions/${deferred.revision}`)
  ).json();
  expect(old.answers.Q04).toBe('deferred');
  expect(old.isCurrent).toBe(false);
  expect(old.supersededAt).not.toBeNull();
  await expect(page.locator('.cat-scale-card')).toHaveCount(0);
  await expect(page.locator('.cat-intersection')).toHaveCount(0);
  await expect(page.locator('.cat-area-button')).toHaveCount(6);
  await expect(page.getByRole('button', { name: labels.areas.health, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: labels.changeHome, exact: true })).toHaveCount(0);
  await expect(page.locator('.cat-trait')).toHaveCount(3);
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
  await page
    .locator('.cat-profile-fold')
    .filter({ has: page.locator('summary', { hasText: labels.history }) })
    .locator('summary')
    .click();
  await page.getByRole('button', { name: labels.portraitHistory, exact: true }).click();
  await expect(page.locator('.cat-revisions button')).toHaveCount(1);
  await page.locator('.cat-revisions button').last().click();
  await expect(page.locator('.cat-portrait-result')).toBeVisible();
  await page.getByRole('button', { name: labels.closeHistory }).click();
  await page.getByRole('button', { name: labels.newObservation, exact: true }).click();
  await page.getByRole('button', { name: labels.start, exact: true }).click();
  await expect(page.locator('.cat-question')).toBeVisible();
  expect((await portrait()).answers).toEqual({ Q02: ['children', 'one_cat'] });
  await page.getByRole('button', { name: labels.back }).click();
  await page
    .getByRole('button', { name: `${labels.edit}: ${labels.areas.home}`, exact: true })
    .click();
  await page.locator('.cat-home-link summary').click();
  await page.getByRole('button', { name: labels.homeChoice, exact: true }).click();
  await page.getByLabel(labels.homeChoice).selectOption('');
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.locator('.cat-identity h2')).toHaveText('Milo');
  expect((await (await page.request.get(`/api/cats/${miloId}`)).json()).household.id).not.toBe(
    milo.household.id,
  );
  expect((await portrait()).contextChangedAt).not.toBeNull();
  await page
    .locator('.cat-profile-fold')
    .filter({ has: page.locator('summary', { hasText: labels.history }) })
    .locator('summary')
    .click();
  await page.getByRole('button', { name: labels.catHistory, exact: true }).click();
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
