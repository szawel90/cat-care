import {
  BARF_PLANNER_VERSION,
  emptyBarfInput,
  snapshotBarf,
  type BarfInput,
} from '@cat-care/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApi } from '../src/bootstrap';
import { PrismaService } from '../src/prisma.service';
import { loadEnvironment } from '../src/environment';
import { AuthService } from '../src/auth/auth.service';
import { registerAuthRoutes } from '../src/auth/auth-routes';
import type { AccountMail } from '../src/auth/mail-sender';

describe('Account lifecycle and access isolation', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let admin: PrismaService;
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const origin = 'http://127.0.0.1:3330';
  const mail: AccountMail[] = [];
  const password = 'Synthetic test password 2026!';
  let ip = 1;

  beforeAll(async () => {
    loadEnvironment();
    process.env.AUTH_BASE_URL = origin;
    process.env.BETTER_AUTH_SECRET = 'synthetic-integration-secret-not-used-outside-tests';
    process.env.GOOGLE_CLIENT_ID = 'synthetic-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'synthetic-google-secret';
    admin = new PrismaService();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const name of [
      '202609080002_account_foundation',
      '202609080003_email_actions',
      '202609080004_account_theme',
      '202609090001_account_language',
      '202609090002_cats_and_households',
      '202609090010_barf_recipes',
    ]) {
      const sql = await readFile(
        resolve(__dirname, '../../../prisma/migrations', name, 'migration.sql'),
        'utf8',
      );
      for (const statement of sql.split(';').filter((part) => part.trim())) {
        await admin.$executeRawUnsafe(
          statement.replace(
            /"(User|AuthAccount|AuthSession|AuthVerification|AccessApproval|AuthRateLimit|EmailAction|UserRole|AccessStatus|ThemePreference|LanguagePreference|Household|Cat|PortraitRevision|CatVersion|HouseholdVersion|BarfRecipe|BarfRecipeRevision|BarfPreferences)"/g,
            `"${schema}"."$1"`,
          ),
        );
      }
    }
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    prisma = new PrismaService();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider('ACCOUNT_MAIL_SENDER')
      .useValue(async (message: AccountMail) => {
        mail.push(message);
      })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    configureApi(app);
    registerAuthRoutes(app.getHttpAdapter().getInstance(), app.get(AuthService));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (admin) {
      if (!/^test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  });

  function browser() {
    const cookies = new Map<string, string>();
    const remoteAddress = `127.0.0.${++ip}`;
    return async (
      path: string,
      body?: Record<string, unknown>,
      extraHeaders: Record<string, string> = {},
    ) => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: body ? 'POST' : 'GET',
          url: path,
          remoteAddress,
          headers: {
            origin,
            cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...extraHeaders,
          },
          ...(body ? { payload: body } : {}),
        });
      const values = response.headers['set-cookie'];
      for (const cookie of typeof values === 'string' ? [values] : (values ?? [])) {
        const part = cookie.split(';')[0]!;
        const i = part.indexOf('=');
        cookies.set(part.slice(0, i), part.slice(i + 1));
      }
      return response;
    };
  }
  function link(address: string, subject: string) {
    const message = mail.findLast((item) => item.to === address && item.subject.includes(subject));
    if (!message) throw new Error(`Missing ${subject} test email`);
    const url = new URL(message.text.match(/https?:\/\/\S+/)![0]);
    return url.pathname + url.search;
  }
  async function register(address: string) {
    await prisma.accessApproval.create({ data: { email: address } });
    const send = browser();
    const signedUp = await send('/api/auth/sign-up/email', {
      name: 'Alex',
      email: address,
      password,
    });
    expect(signedUp.statusCode).toBe(200);
    expect(signedUp.json().token).toBeNull();
    return send;
  }
  async function signIn(address: string, send = browser(), secret = password) {
    const response = await send('/api/auth/sign-in/email', { email: address, password: secret });
    expect(response.statusCode).toBe(200);
    return send;
  }

  it('isolates BARF recipes, preserves revisions and rejects stale writes and untrusted input', async () => {
    const ownerEmail = 'barf-owner@example.test';
    const otherEmail = 'barf-other@example.test';
    const owner = await register(ownerEmail);
    await owner(link(ownerEmail, 'Verify'));
    await signIn(ownerEmail, owner);
    const other = await register(otherEmail);
    await other(link(otherEmail, 'Verify'));
    await signIn(otherEmail, other);
    const userId = (await owner('/v1/account')).json().id;
    const path = '/v1/account/barf/recipes';
    const input = {
      ...emptyBarfInput(),
      title: 'Synthetic recipe',
      catName: 'Synthetic cat',
      items: [
        { ingredientId: 'meat-076', quantity: 1000 },
        { ingredientId: 'water', quantity: 300 },
      ],
    };
    expect((await browser()(path)).statusCode).toBe(401);
    expect((await owner(path, { input }, { origin: 'https://untrusted.example' })).statusCode).toBe(
      403,
    );
    expect((await owner(path, {})).statusCode).toBe(400);
    expect((await owner(path, { input: { ...input, result: { days: 999 } } })).statusCode).toBe(
      400,
    );
    expect(
      (await owner(path, { input: { ...input, items: [{ ingredientId: 'water', quantity: -1 }] } }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await owner(path, {
          input: { ...input, items: [{ ingredientId: 'water', quantity: 100 }] },
        })
      ).statusCode,
    ).toBe(400);
    expect((await owner(path, { input: { ...input, engineVersion: 'old' } })).statusCode).toBe(400);
    const created = await owner(path, { input });
    expect(created.statusCode).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const recipe = created.json();
    expect(recipe.revisions[0].snapshot.result.days).toBe(10);
    expect(recipe.revisions[0].snapshot.ingredients).toHaveLength(2);
    const idPath = path + '/' + recipe.id;
    expect((await other(idPath)).statusCode).toBe(404);
    expect((await other(idPath, { input, expectedVersion: 1 })).statusCode).toBe(404);
    expect((await other(idPath + '/archive', { expectedVersion: 1 })).statusCode).toBe(404);
    expect((await other(path)).json()).toEqual([]);
    expect((await owner(idPath, { expectedVersion: 1 })).statusCode).toBe(400);
    const concurrent = await Promise.all([
      owner(idPath, { input: { ...input, title: 'Version A' }, expectedVersion: 1 }),
      owner(idPath, { input: { ...input, title: 'Version B' }, expectedVersion: 1 }),
    ]);
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const current = (await owner(idPath)).json();
    expect(current.currentVersion).toBe(2);
    expect(current.revisions).toHaveLength(2);
    expect(current.revisions[1]).toMatchObject({
      version: 1,
      status: 'superseded',
      snapshot: { input },
    });
    expect((await owner(idPath, { input, expectedVersion: 1 })).statusCode).toBe(409);
    const archived = await owner(idPath + '/archive', { expectedVersion: 2 });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().revisions[0].status).toBe('withdrawn');
    expect(archived.json().revisions).toHaveLength(3);
    expect((await owner(idPath, { input, expectedVersion: 3 })).statusCode).toBe(409);
    const favoritePath = '/v1/account/barf/favorites';
    expect((await owner(favoritePath, { ingredientIds: ['meat-076'] })).json()).toEqual({
      ingredientIds: ['meat-076'],
    });
    expect((await other(favoritePath)).json()).toEqual({ ingredientIds: [] });
    expect((await owner(favoritePath, { ingredientIds: ['unknown'] })).statusCode).toBe(400);
    const exported = (await owner('/v1/account/export')).json();
    expect(exported.barfRecipes).toHaveLength(1);
    expect(exported.barfRecipes[0].revisions).toHaveLength(3);
    expect(exported.barfFavorites).toEqual(['meat-076']);
    expect((await other('/v1/account/export')).json().barfRecipes).toEqual([]);
    await prisma.accessApproval.update({
      where: { email: ownerEmail },
      data: { status: 'REVOKED' },
    });
    expect((await owner(path)).statusCode).toBe(403);
    expect((await owner(favoritePath)).statusCode).toBe(403);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.barfRecipe.count({ where: { userId } })).toBe(0);
    expect(await prisma.barfRecipeRevision.count({ where: { recipeId: recipe.id } })).toBe(0);
    expect(await prisma.barfPreferences.count({ where: { userId } })).toBe(0);
  });

  it('recomputes planner assessments and all-nutrient zero assumptions while preserving legacy history', async () => {
    const email = 'barf-planner@example.test';
    const owner = await register(email);
    await owner(link(email, 'Verify'));
    await signIn(email, owner);
    const userId = (await owner('/v1/account')).json().id;
    const input: BarfInput = {
      ...emptyBarfInput(),
      title: 'Synthetic planned meal',
      items: [
        { ingredientId: 'meat-041', quantity: 1000 },
        { ingredientId: 'supplement-016', quantity: 2.417 },
      ],
      planning: {
        version: BARF_PLANNER_VERSION,
        mode: 'inventory',
        meatGrams: 1000,
        inventory: [{ ingredientId: 'meat-041', quantity: 1000, useAll: true }],
      },
    };
    const path = '/v1/account/barf/recipes';
    for (const planning of [
      null,
      { ...input.planning, mode: 'invalid' },
      { ...input.planning, targetsMet: true },
      { ...input.planning, inventory: [{ ingredientId: 'meat-041', quantity: 999, useAll: true }] },
    ]) {
      expect((await owner(path, { input: { ...input, planning } })).statusCode).toBe(400);
    }
    const created = await owner(path, { input });
    expect(created.statusCode).toBe(201);
    const saved = created.json();
    const snapshot = saved.revisions[0].snapshot;
    expect(snapshot.result.taurineZeroAssumption).toEqual({
      value: 0,
      ingredientIds: ['meat-041'],
    });
    expect(snapshot.planning.targetsMet).toBe(false);
    expect(snapshot.result.missingValuesAssumption.value).toBe(0);
    expect(snapshot.planning.missingValuesAssumption).toEqual(
      snapshot.result.missingValuesAssumption,
    );
    expect(
      snapshot.planning.checks.every((c: { actual: number | null }) => c.actual !== null),
    ).toBe(true);
    expect(snapshot.planning.purchases).toEqual([
      { ingredientId: 'supplement-016', quantity: 2.417 },
    ]);
    expect(
      snapshot.ingredients.find((i: { id: string }) => i.id === 'meat-041').nutrients.taurine,
    ).toBeNull();
    const legacyInput = {
      ...emptyBarfInput(),
      title: 'Synthetic legacy',
      items: [{ ingredientId: 'meat-041', quantity: 1000 }],
    };
    const legacy = snapshotBarf(legacyInput);
    legacy.input.engineVersion = 'barf-1.9c-corrected-v1';
    delete legacy.result.taurineZeroAssumption;
    delete legacy.result.missingValuesAssumption;
    const stored = await prisma.barfRecipe.create({
      data: {
        userId,
        revisions: { create: { version: 1, snapshot: JSON.parse(JSON.stringify(legacy)) } },
      },
    });
    expect((await owner(path + '/' + stored.id)).json().revisions[0].snapshot).toEqual(legacy);
    expect(
      (await owner(path + '/' + stored.id, { input: legacy.input, expectedVersion: 1 })).statusCode,
    ).toBe(400);
    const changed = await owner(path + '/' + stored.id, { input: legacyInput, expectedVersion: 1 });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().revisions[1].snapshot).toEqual(legacy);
    expect(changed.json().revisions[0].snapshot.result.taurineZeroAssumption.ingredientIds).toEqual(
      ['meat-041'],
    );
    const exported = (await owner('/v1/account/export')).json();
    expect(
      exported.barfRecipes.find((r: { id: string }) => r.id === saved.id).revisions[0].snapshot,
    ).toEqual(snapshot);
  });

  it('manages pilot admission through the local operator command', async () => {
    const command = resolve(__dirname, '../dist/manage-access.js');
    await promisify(execFile)(process.execPath, [command, 'approve', 'operator@example.test'], {
      env: process.env,
    });
    expect(
      (await prisma.accessApproval.findUniqueOrThrow({ where: { email: 'operator@example.test' } }))
        .status,
    ).toBe('ACTIVE');
    await promisify(execFile)(process.execPath, [command, 'revoke', 'operator@example.test'], {
      env: process.env,
    });
    expect(
      (await prisma.accessApproval.findUniqueOrThrow({ where: { email: 'operator@example.test' } }))
        .status,
    ).toBe('REVOKED');
  });

  it('requires approval and verified email, stores a password hash, and consumes verification links once', async () => {
    const denied = await browser()('/api/auth/sign-up/email', {
      name: 'Alex',
      email: 'unapproved@example.test',
      password,
    });
    expect(denied.statusCode).toBe(200);
    expect(await prisma.user.count({ where: { email: 'unapproved@example.test' } })).toBe(0);
    const send = await register('first@example.test');
    expect(
      (await send('/api/auth/sign-in/email', { email: 'first@example.test', password })).statusCode,
    ).toBe(403);
    const verification = link('first@example.test', 'Verify');
    expect((await send(verification)).statusCode).toBe(302);
    expect((await send(verification)).statusCode).toBe(400);
    await signIn('first@example.test', send);
    const account = (await send('/v1/account')).json();
    expect(account).toMatchObject({
      displayName: 'Alex',
      email: 'first@example.test',
      emailVerified: true,
    });
    expect(account.id).toMatch(/^[a-f0-9-]{36}$/);
    const stored = await prisma.authAccount.findFirstOrThrow({
      where: { userId: account.id, providerId: 'credential' },
    });
    expect(stored.password).not.toBe(password);
    expect(stored.password!.length).toBeGreaterThan(64);
    expect((await send('/v1/account')).headers['cache-control']).toBe('no-store');
  });

  it('edits and exports only the current user, and immediately blocks revoked sessions', async () => {
    const send = await register('profile@example.test');
    await send(link('profile@example.test', 'Verify'));
    await signIn('profile@example.test', send);
    expect(
      (await send('/api/auth/update-user', { name: '  Morgan  ', role: 'ADMIN' })).statusCode,
    ).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'profile@example.test' } });
    expect(user.role).toBe('USER');
    expect((await send('/v1/account')).json().displayName).toBe('Morgan');
    const exported = (await send('/v1/account/export')).json();
    expect(exported.profile.email).toBe(user.email);
    expect(JSON.stringify(exported)).not.toMatch(/password|accessToken|refreshToken|session_token/);
    expect((await browser()('/v1/account')).statusCode).toBe(401);
    await prisma.accessApproval.update({ where: { userId: user.id }, data: { status: 'REVOKED' } });
    expect((await send('/v1/account')).statusCode).toBe(403);
    expect((await send('/api/auth/get-session')).statusCode).toBe(403);
    expect((await send('/api/auth/update-user', { name: 'Unauthorized' })).statusCode).toBe(403);
    expect(
      (await send('/api/auth/sign-in/email', { email: user.email, password })).statusCode,
    ).toBe(403);
  });

  it('persists appearance across sessions, isolates owners, validates changes and blocks revoked access', async () => {
    const address = 'appearance@example.test';
    const first = await register(address);
    await first(link(address, 'Verify'));
    await signIn(address, first);
    const otherDevice = await signIn(address);
    const otherOwner = await register('other-appearance@example.test');
    await otherOwner(link('other-appearance@example.test', 'Verify'));
    await signIn('other-appearance@example.test', otherOwner);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(user.themePreference).toBe('system');
    const initial = await first('/v1/account/preferences');
    expect(initial.json()).toEqual({ themePreference: 'system', languagePreference: 'system' });
    expect(initial.headers['cache-control']).toBe('no-store');
    for (const themePreference of ['dark', 'light', 'system']) {
      const saved = await first('/v1/account/preferences', { themePreference });
      expect(saved.statusCode).toBe(200);
      expect(saved.headers['cache-control']).toBe('no-store');
      expect((await otherDevice('/v1/account/preferences')).json()).toEqual({
        themePreference,
        languagePreference: 'system',
      });
      expect((await otherOwner('/v1/account/preferences')).json().themePreference).toBe('system');
      expect((await first('/v1/account/export')).json().profile.themePreference).toBe(
        themePreference,
      );
    }
    for (const payload of [
      {},
      { themePreference: null },
      { themePreference: 'blue' },
      { themePreference: 'dark', userId: user.id },
    ])
      expect((await first('/v1/account/preferences', payload)).statusCode).toBe(400);
    for (const foreignOrigin of ['https://untrusted.example', 'null', ''])
      expect(
        (
          await first(
            '/v1/account/preferences',
            { themePreference: 'dark' },
            { origin: foreignOrigin },
          )
        ).statusCode,
      ).toBe(403);
    expect((await browser()('/v1/account/preferences')).statusCode).toBe(401);
    expect(
      (await browser()('/v1/account/preferences', { themePreference: 'dark' })).statusCode,
    ).toBe(401);
    expect((await first('/v1/account/preferences')).json().themePreference).toBe('system');
    await prisma.accessApproval.update({ where: { userId: user.id }, data: { status: 'REVOKED' } });
    expect((await first('/v1/account/preferences')).statusCode).toBe(403);
    expect((await first('/v1/account/preferences', { themePreference: 'dark' })).statusCode).toBe(
      403,
    );
  });

  it('persists language independently from theme, isolates owners and localizes account email', async () => {
    const address = 'polish-language@example.test';
    await prisma.accessApproval.create({ data: { email: address } });
    const first = browser();
    expect(
      (
        await first(
          '/api/auth/sign-up/email',
          { name: 'Alex', email: address, password },
          { 'x-cat-care-locale': 'pl' },
        )
      ).statusCode,
    ).toBe(200);
    await first(link(address, 'Potwierdź'));
    await signIn(address, first);
    const otherDevice = await signIn(address);
    const other = await register('language-owner-two@example.test');
    await other(link('language-owner-two@example.test', 'Verify'));
    await signIn('language-owner-two@example.test', other);
    expect((await first('/v1/account/preferences')).json()).toEqual({
      themePreference: 'system',
      languagePreference: 'system',
    });
    await first('/v1/account/preferences', { themePreference: 'dark' });
    for (const languagePreference of ['pl', 'en', 'system']) {
      const saved = await first('/v1/account/preferences', { languagePreference });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual({ languagePreference, themePreference: 'dark' });
      expect((await otherDevice('/v1/account/preferences')).json()).toEqual(saved.json());
      expect((await other('/v1/account/preferences')).json().languagePreference).toBe('system');
      expect((await first('/v1/account/export')).json().profile.languagePreference).toBe(
        languagePreference,
      );
    }
    for (const payload of [
      { languagePreference: null },
      { languagePreference: 'de' },
      { languagePreference: ['pl'] },
      { languagePreference: 'pl', userId: 'someone-else' },
    ]) {
      expect((await first('/v1/account/preferences', payload)).statusCode).toBe(400);
    }
    for (const origin of ['', 'null', 'https://untrusted.example']) {
      expect(
        (await first('/v1/account/preferences', { languagePreference: 'pl' }, { origin }))
          .statusCode,
      ).toBe(403);
    }
    expect(
      (await browser()('/v1/account/preferences', { languagePreference: 'pl' })).statusCode,
    ).toBe(401);
    await first('/v1/account/preferences', { languagePreference: 'pl' });
    await first('/v1/account/preferences', { themePreference: 'light' });
    expect((await first('/v1/account/preferences')).json()).toEqual({
      languagePreference: 'pl',
      themePreference: 'light',
    });
    await first(
      '/api/auth/request-password-reset',
      { email: address, redirectTo: '/reset-password' },
      { 'x-cat-care-locale': 'en' },
    );
    expect(mail.findLast((item) => item.to === address)?.subject).toBe('Zmień hasło do Cat Care');
    expect(link(address, 'Zmień')).toContain('/reset-password');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    await prisma.accessApproval.update({ where: { userId: user.id }, data: { status: 'REVOKED' } });
    expect((await first('/v1/account/preferences', { languagePreference: 'en' })).statusCode).toBe(
      403,
    );
    expect((await first('/v1/account/preferences')).statusCode).toBe(403);
  });

  it('resets passwords once, invalidates existing sessions, and rejects cross-user session revocation', async () => {
    const one = await register('reset@example.test');
    await one(link('reset@example.test', 'Verify'));
    await signIn('reset@example.test', one);
    const two = await signIn('reset@example.test');
    const foreign = await signIn('first@example.test');
    const sessions = (await one('/api/auth/list-sessions')).json();
    expect(sessions).toHaveLength(2);
    await foreign('/api/auth/revoke-session', { token: sessions[0].token });
    expect((await one('/api/auth/list-sessions')).json()).toHaveLength(2);
    await one('/api/auth/request-password-reset', {
      email: 'reset@example.test',
      redirectTo: '/reset-password',
    });
    const reset = await one(link('reset@example.test', 'Reset'));
    const token = new URL(reset.headers.location!, origin).searchParams.get('token');
    const newPassword = password + ' updated';
    expect((await browser()('/api/auth/reset-password', { token, newPassword })).statusCode).toBe(
      200,
    );
    expect(
      (await browser()('/api/auth/reset-password', { token, newPassword })).statusCode,
    ).toBeGreaterThanOrEqual(400);
    expect((await one('/v1/account')).statusCode).toBe(401);
    expect((await two('/v1/account')).statusCode).toBe(401);
    await signIn('reset@example.test', browser(), newPassword);
    const unknown = await browser()('/api/auth/request-password-reset', {
      email: 'missing@example.test',
      redirectTo: '/reset-password',
    });
    const known = await browser()('/api/auth/request-password-reset', {
      email: 'reset@example.test',
      redirectTo: '/reset-password',
    });
    expect(unknown.json()).toEqual(known.json());
  });

  it('requires approval and confirmation of both addresses when changing email, preserving the owner ID', async () => {
    const send = await register('old@example.test');
    await send(link('old@example.test', 'Verify'));
    await signIn('old@example.test', send);
    const before = (await send('/v1/account')).json();
    expect(
      (await send('/api/auth/change-email', { newEmail: 'new@example.test' })).statusCode,
    ).toBe(403);
    await prisma.accessApproval.create({ data: { email: 'new@example.test' } });
    expect(
      (await send('/api/auth/change-email', { newEmail: 'new@example.test' })).statusCode,
    ).toBe(200);
    expect((await send('/v1/account')).json().email).toBe('old@example.test');
    await send(link('old@example.test', 'Approve'));
    expect((await send('/v1/account')).json().email).toBe('old@example.test');
    const changed = await send(link('new@example.test', 'Verify'));
    expect(changed.statusCode).toBe(302);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(stored.email).toBe('new@example.test');
    expect((await send('/v1/account')).statusCode).toBe(401);
    await signIn('new@example.test', send);
    expect((await send('/v1/account')).json().id).toBe(before.id);
  });

  it('rejects stale sensitive actions and deleting the last login method, then deletes account data and links', async () => {
    const send = await register('delete@example.test');
    await send(link('delete@example.test', 'Verify'));
    await signIn('delete@example.test', send);
    const profile = (await send('/v1/account')).json();
    const accounts = (await send('/api/auth/list-accounts')).json();
    expect((await send('/api/auth/unlink-account', { accountId: accounts[0].id })).statusCode).toBe(
      400,
    );
    await prisma.authSession.updateMany({
      where: { userId: profile.id },
      data: { createdAt: new Date(Date.now() - 600_000) },
    });
    expect((await send('/api/auth/delete-user', {})).statusCode).toBe(403);
    await signIn('delete@example.test', send);
    await send('/api/auth/request-password-reset', {
      email: 'delete@example.test',
      redirectTo: '/reset-password',
    });
    expect((await send('/api/auth/delete-user', {})).statusCode).toBe(200);
    expect((await send(link('delete@example.test', 'deletion'))).statusCode).toBe(302);
    expect(await prisma.user.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await prisma.authAccount.count({ where: { userId: profile.id } })).toBe(0);
    expect(await prisma.authSession.count({ where: { userId: profile.id } })).toBe(0);
    expect(await prisma.authVerification.count({ where: { value: profile.id } })).toBe(0);
    expect((await send('/v1/account')).statusCode).toBe(401);
    expect(
      (
        await browser()('/api/auth/sign-up/email', {
          name: 'Alex',
          email: 'delete@example.test',
          password,
        })
      ).statusCode,
    ).toBe(200);
    expect(await prisma.user.count({ where: { email: 'delete@example.test' } })).toBe(0);
  });

  it('rejects expired links and revokes other sessions after a password change', async () => {
    const send = await register('expiry@example.test');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'expiry@example.test' } });
    const verification = link(user.email, 'Verify');
    await prisma.emailAction.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await send(verification)).statusCode).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(
      false,
    );
    await prisma.emailAction.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    await send(verification);
    await signIn(user.email, send);
    const other = await signIn(user.email);
    const changed = password + ' changed';
    expect(
      (
        await send('/api/auth/change-password', {
          currentPassword: password,
          newPassword: changed,
          revokeOtherSessions: false,
        })
      ).statusCode,
    ).toBe(200);
    expect((await other('/v1/account')).statusCode).toBe(401);
    expect((await send('/v1/account')).statusCode).toBe(200);
    await send('/api/auth/request-password-reset', {
      email: user.email,
      redirectTo: '/reset-password',
    });
    const reset = await send(link(user.email, 'Reset'));
    const token = new URL(reset.headers.location!, origin).searchParams.get('token');
    await prisma.authVerification.updateMany({
      where: { value: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await browser()('/api/auth/reset-password', { token, newPassword: password })).statusCode,
    ).toBeGreaterThanOrEqual(400);
    await signIn(user.email, browser(), changed);
  });

  it('handles Google admission, explicit linking, missing email, cancellation and replay without merging owners', async () => {
    const context = await app.get(AuthService).auth.$context;
    const google = context.socialProviders.find((provider) => provider.id === 'google')!;
    const exchange = google.validateAuthorizationCode;
    const userInfo = google.getUserInfo;
    let providerEmail = 'google@example.test';
    let providerId = 'google-test-owner';
    let verified = true;
    const usedCodes = new Set<string>();
    google.validateAuthorizationCode = async ({ code }) => {
      if (usedCodes.has(code)) throw new Error('Code already exchanged');
      usedCodes.add(code);
      return {
        accessToken: 'synthetic-provider-access-token',
        scopes: ['openid', 'email', 'profile'],
      };
    };
    google.getUserInfo = async () => ({
      user: { email: providerEmail, emailVerified: verified, name: 'Google Owner' },
      data: { sub: providerId },
    });
    async function oauth(send: ReturnType<typeof browser>, linkAccount = false, failure?: string) {
      const begin = await send(linkAccount ? '/api/auth/link-social' : '/api/auth/sign-in/social', {
        provider: 'google',
        callbackURL: '/account',
        errorCallbackURL: '/login',
      });
      expect(begin.statusCode).toBe(200);
      const state = new URL(begin.json().url).searchParams.get('state');
      expect(state).toBeTruthy();
      const callback = `/api/auth/callback/google?state=${state}&${failure ? 'error=' + failure : 'code=' + randomUUID()}`;
      return { callback, result: await send(callback) };
    }
    try {
      await prisma.accessApproval.create({ data: { email: providerEmail } });
      const send = browser();
      const signedIn = await oauth(send);
      expect(signedIn.result.statusCode).toBe(302);
      expect(signedIn.result.headers.location).toContain('/account');
      const profile = (await send('/v1/account')).json();
      expect(profile.email).toBe(providerEmail);
      const providerAccount = await prisma.authAccount.findFirstOrThrow({
        where: { userId: profile.id },
      });
      expect(providerAccount.providerId).toBe('google');
      expect(providerAccount.password).toBeNull();
      expect(providerAccount.accessToken).not.toBe('synthetic-provider-access-token');
      const replay = await browser()(signedIn.callback);
      expect(replay.headers.location).toContain('error');

      providerEmail = 'first@example.test';
      providerId = 'google-existing-email';
      const collision = await oauth(browser());
      expect(collision.result.headers.location).toContain('account_not_linked');
      const existing = await prisma.user.findUniqueOrThrow({ where: { email: providerEmail } });
      expect(await prisma.authAccount.count({ where: { userId: existing.id } })).toBe(1);
      const owner = await signIn(providerEmail);
      const linked = await oauth(owner, true);
      expect(linked.result.headers.location).toContain('/account');
      expect(await prisma.authAccount.count({ where: { userId: existing.id } })).toBe(2);
      const returning = browser();
      await oauth(returning);
      expect((await returning('/v1/account')).json().id).toBe(existing.id);

      providerEmail = 'unapproved-google@example.test';
      providerId = 'unapproved-google';
      expect((await oauth(browser())).result.headers.location).toContain('error');
      expect(await prisma.user.count({ where: { email: providerEmail } })).toBe(0);
      providerEmail = '';
      providerId = 'missing-email';
      expect((await oauth(browser())).result.headers.location).toContain('error');
      expect(await prisma.authAccount.count({ where: { accountId: providerId } })).toBe(0);
      providerEmail = 'unverified-google@example.test';
      providerId = 'unverified-google';
      verified = false;
      await prisma.accessApproval.create({ data: { email: providerEmail } });
      const unverified = browser();
      await oauth(unverified);
      expect((await unverified('/v1/account')).statusCode).toBe(401);
      expect((await oauth(browser(), false, 'access_denied')).result.headers.location).toContain(
        'error',
      );

      await prisma.accessApproval.update({
        where: { userId: profile.id },
        data: { status: 'REVOKED' },
      });
      providerEmail = 'google@example.test';
      providerId = 'google-test-owner';
      verified = true;
      expect((await oauth(browser())).result.headers.location).toContain('error');
      expect((await send('/v1/account')).statusCode).toBe(403);
    } finally {
      google.validateAuthorizationCode = exchange;
      google.getUserInfo = userInfo;
    }
  });

  it('rejects untrusted origins, unsafe redirects, malformed OAuth callbacks and repeated sign-in attempts', async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
        payload: { email: 'first@example.test', password },
      });
    expect(response.statusCode).toBe(403);
    expect(
      (
        await browser()('/api/auth/request-password-reset', {
          email: 'first@example.test',
          redirectTo: 'https://untrusted.example',
        })
      ).statusCode,
    ).toBe(403);
    const callback = await browser()('/api/auth/callback/google?code=forged&state=invalid');
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain('error');
    const limited = browser();
    let status = 0;
    for (let attempt = 0; attempt < 12; attempt++)
      status = (
        await limited('/api/auth/sign-in/email', { email: 'missing@example.test', password })
      ).statusCode;
    expect(status).toBe(429);
  });
});
