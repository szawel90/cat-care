import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingHttpHeaders } from 'node:http';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApi, createOpenApiDocument } from '../src/bootstrap';
import { PrismaService } from '../src/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { loadEnvironment } from '../src/environment';

describe('Owned cats, households and immutable observations', () => {
  let app: NestFastifyApplication, database: PrismaService, admin: PrismaService;
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const owner = randomUUID(),
    otherOwner = randomUUID();
  const origin = 'http://127.0.0.1:3330';
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 27 * 86_400_000).toISOString().slice(0, 10);
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    loadEnvironment();
    originalDatabaseUrl = process.env.DATABASE_URL;
    admin = new PrismaService();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const directory = resolve(__dirname, '../../../prisma/migrations');
    for (const name of (await readdir(directory)).filter((item) => /^\d/.test(item)).sort()) {
      const sql = await readFile(resolve(directory, name, 'migration.sql'), 'utf8');
      for (const statement of sql
        .split(';')
        .filter((part) => part.trim() && !part.includes('CREATE EXTENSION'))) {
        await admin.$executeRawUnsafe(
          statement.replace(
            /"(User|AuthAccount|AuthSession|AuthVerification|AccessApproval|AuthRateLimit|EmailAction|UserRole|AccessStatus|ThemePreference|LanguagePreference|Household|Cat|PortraitRevision|CatVersion|HouseholdVersion)"/g,
            `"${schema}"."$1"`,
          ),
        );
      }
    }
    const url = new URL(originalDatabaseUrl!);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    database = new PrismaService();
    await database.user.createMany({
      data: [owner, otherOwner].map((id, index) => ({
        id,
        email: `owner-${index}@example.test`,
        displayName: 'Synthetic owner',
        emailVerified: true,
      })),
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(database)
      .overrideProvider(AuthService)
      .useValue({
        settings: { baseUrl: origin },
        currentUser: async (headers: IncomingHttpHeaders) => {
          const id = headers['x-test-owner'];
          if (id !== owner && id !== otherOwner) throw new UnauthorizedException();
          return { user: { id, name: 'Synthetic owner' }, session: { createdAt: new Date() } };
        },
      })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    configureApi(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
    if (admin) {
      if (!/^test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe schema');
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });
  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    payload?: object,
    who: string = owner,
    requestOrigin = origin,
  ) {
    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method,
        url: path,
        headers: {
          'x-test-owner': who,
          origin: requestOrigin,
          ...(payload ? { 'content-type': 'application/json' } : {}),
        },
        ...(payload ? { payload } : {}),
      });
  }
  async function create(name: string, extra: object = {}, who = owner) {
    const response = await request('POST', '/v1/cats', { name, ...extra }, who);
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  it('requires only a nonblank name and rejects injected ownership, unauthorized links and origins', async () => {
    expect((await request('POST', '/v1/cats', { name: '  ' })).statusCode).toBe(400);
    expect(
      (await request('POST', '/v1/cats', { name: 'Milo', ownerId: otherOwner })).statusCode,
    ).toBe(400);
    expect(
      (await request('POST', '/v1/cats', { name: 'Milo' }, owner, 'https://untrusted.example'))
        .statusCode,
    ).toBe(403);
    const cat = await create('Milo');
    expect(
      (await request('PATCH', `/v1/cats/${cat.id}`, { expectedVersion: cat.version, name: null }))
        .statusCode,
    ).toBe(400);
    expect((await request('GET', `/v1/cats/${cat.id}/portrait`)).json()).toBeNull();
    expect(
      createOpenApiDocument(app).paths['/v1/cats/{id}/portrait']?.get?.responses['200'],
    ).toMatchObject({ content: { 'application/json': { schema: { nullable: true } } } });
    expect(cat.attributes).toEqual({});
    expect(cat.hasPhoto).toBe(false);
    expect(cat.portraitStatus).toBe('not_started');
    expect((await request('GET', `/v1/cats/${cat.id}`, undefined, otherOwner)).statusCode).toBe(
      404,
    );
    expect(
      (
        await request(
          'POST',
          '/v1/cats',
          { name: 'Cross-owner link', livesWithCatId: cat.id },
          otherOwner,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await request('GET', `/v1/cats/${cat.id}/history`, undefined, otherOwner)).statusCode,
    ).toBe(404);
    expect((await request('GET', '/v1/cats', undefined, '')).statusCode).toBe(401);
  });

  it('reuses confirmed shared home facts while keeping separate homes and individual behavior separate', async () => {
    const luna = await create('Luna');
    const response = await request('PATCH', `/v1/cats/${luna.id}`, {
      expectedVersion: luna.version,
      attributes: { games: 'Chases a soft ball' },
      household: {
        expectedVersion: luna.household.version,
        facts: { children: 'yes', dogs: 'no', other_animals: 'no', totalCats: 'two' },
        environment: { highPlaces: 'Two shelves' },
      },
    });
    expect(response.statusCode).toBe(200);
    const milo = await create('Milo shared', { livesWithCatId: luna.id });
    const nori = await create('Nori separate');
    expect(milo.household.id).toBe(luna.household.id);
    expect(milo.attributes).toEqual({});
    expect(milo.household.environment.highPlaces).toBe('Two shelves');
    expect(nori.household.id).not.toBe(luna.household.id);
    expect(nori.household.facts.children).toBe('unknown');
    const portrait = await request('POST', `/v1/cats/${milo.id}/portrait`, {
      expectedRevision: 0,
      periodStart: start,
      periodEnd: today,
    });
    expect(portrait.statusCode).toBe(201);
    expect(portrait.json().answers.Q02).toEqual(['children', 'one_cat']);
    expect(portrait.json().prefilledQuestions).toEqual(['Q02']);
    expect(portrait.json().result.vector.activity).toBeNull();
    const moved = await request('POST', `/v1/cats/${milo.id}/household`, {
      expectedVersion: milo.version,
      livesWithCatId: null,
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().household.id).not.toBe(luna.household.id);
    const previous = (await request('GET', `/v1/cats/${milo.id}/portrait`)).json();
    expect(previous.householdSnapshot.id).toBe(luna.household.id);
    expect(previous.answers.Q02).toEqual(['children', 'one_cat']);
    expect(previous.contextChangedAt).not.toBeNull();
    const newPeriod = await request('POST', `/v1/cats/${milo.id}/portrait`, {
      expectedRevision: previous.revision,
      periodStart: start,
      periodEnd: today,
    });
    expect(newPeriod.json().answers).toEqual({});
    expect(newPeriod.json().assessmentId).not.toBe(previous.assessmentId);
  });

  it('keeps source values immutable, rejects lost updates, and preserves archive/restore history', async () => {
    const cat = await create('Original name');
    const updates = await Promise.all(
      ['Name A', 'Name B'].map((name) =>
        request('PATCH', `/v1/cats/${cat.id}`, { expectedVersion: cat.version, name }),
      ),
    );
    expect(updates.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const current = (await request('GET', `/v1/cats/${cat.id}`)).json();
    const history = (await request('GET', `/v1/cats/${cat.id}/history`)).json();
    expect(history.cats).toHaveLength(2);
    expect(history.cats[1].name).toBe('Original name');
    expect(history.cats[1].isCurrent).toBe(false);
    expect(history.cats[1].supersededAt).not.toBeNull();
    expect(history.cats[0].isCurrent).toBe(true);
    expect(
      (await request('DELETE', `/v1/cats/${cat.id}`, { expectedVersion: current.version }))
        .statusCode,
    ).toBe(204);
    expect(
      (await request('GET', '/v1/cats')).json().some((item: { id: string }) => item.id === cat.id),
    ).toBe(false);
    const archived = (await request('GET', '/v1/cats?archived=true'))
      .json()
      .find((item: { id: string }) => item.id === cat.id);
    expect(archived.archivedAt).not.toBeNull();
    const restored = await request('POST', `/v1/cats/${cat.id}/restore`, {
      expectedVersion: archived.version,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().archivedAt).toBeNull();
    expect((await request('GET', `/v1/cats/${cat.id}/history`)).json().cats).toHaveLength(4);
  });

  it('stores deferred responses as dated revisions and recalculates only the new result', async () => {
    const cat = await create('Observation cat');
    let portrait = (
      await request('POST', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: 0,
        periodStart: start,
        periodEnd: today,
      })
    ).json();
    for (const [questionId, answer] of [
      ['Q01', 'usual'],
      ['Q02', ['none']],
      ['Q03', 'none'],
      ['Q04', 'deferred'],
      ['Q05', 'joins_play'],
    ] as const) {
      const response = await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: portrait.revision,
        questionId,
        answer,
      });
      expect(response.statusCode).toBe(200);
      portrait = response.json();
    }
    const deferredRevision = portrait.revision;
    expect(portrait.result.pending).toContainEqual({ id: 'Q04', state: 'awaiting_observation' });
    const response = await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
      expectedRevision: portrait.revision,
      questionId: 'Q04',
      answer: 'often',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().result.axes.activity.point).toBe(3.5);
    const old = (
      await request('GET', `/v1/cats/${cat.id}/portrait/revisions/${deferredRevision}`)
    ).json();
    expect(old.answers.Q04).toBe('deferred');
    expect(old.result.axes.activity.point).toBe(4);
    expect(old.isCurrent).toBe(false);
    expect(
      (
        await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
          expectedRevision: deferredRevision,
          questionId: 'Q04',
          answer: 'never',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await request('GET', `/v1/cats/${cat.id}/portrait`, undefined, otherOwner)).statusCode,
    ).toBe(404);
    const currentCat = (await request('GET', `/v1/cats/${cat.id}`)).json();
    await request('PATCH', `/v1/cats/${cat.id}`, {
      expectedVersion: currentCat.version,
      attributes: { mobility: 'Owner reports a change in jumping' },
    });
    const unchanged = (await request('GET', `/v1/cats/${cat.id}/portrait`)).json();
    expect(unchanged.result.axes.activity.point).toBe(3.5);
    expect(unchanged.contextChangedAt).not.toBeNull();
  });

  it('validates private photos and preserves old photo versions and full exports', async () => {
    const image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#2060aa' },
    })
      .png()
      .toBuffer();
    const cat = await create('Photo cat', {
      photoDataUrl: 'data:image/png;base64,' + image.toString('base64'),
    });
    const photo = await request('GET', `/v1/cats/${cat.id}/photo`);
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['cache-control']).toBe('no-store');
    expect(photo.headers['content-type']).toContain('image/webp');
    expect(
      (await request('GET', `/v1/cats/${cat.id}/photo`, undefined, otherOwner)).statusCode,
    ).toBe(404);
    expect(
      (
        await request('PATCH', `/v1/cats/${cat.id}`, {
          expectedVersion: cat.version,
          photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('PATCH', `/v1/cats/${cat.id}`, {
          expectedVersion: cat.version,
          photoDataUrl: null,
        })
      ).statusCode,
    ).toBe(200);
    expect((await request('GET', `/v1/cats/${cat.id}/photo`)).statusCode).toBe(404);
    expect((await request('GET', `/v1/cats/${cat.id}/photo?version=1`)).statusCode).toBe(200);
    const exported = await request('GET', '/v1/account/export');
    expect(exported.statusCode).toBe(200);
    const own = exported.json().cats.find((item: { id: string }) => item.id === cat.id);
    expect(own.versions[0].photoDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(own.versions[1].photoDataUrl).toBeNull();
    expect(exported.json().cats.every((item: { ownerId: string }) => item.ownerId === owner)).toBe(
      true,
    );
  });

  it('does not treat archiving as a move, and snapshots names before later renaming', async () => {
    const luna = await create('Household Luna');
    const milo = await create('Household Milo', { livesWithCatId: luna.id });
    const before = (await request('GET', `/v1/cats/${luna.id}`)).json();
    expect(before.household.facts.totalCats).toBe('two');
    await request('DELETE', `/v1/cats/${milo.id}`, { expectedVersion: milo.version });
    const after = (await request('GET', `/v1/cats/${luna.id}`)).json();
    expect(after.household.facts.totalCats).toBe('two');
    expect(after.household.members).toHaveLength(2);
    const renamed = await request('PATCH', `/v1/cats/${luna.id}`, {
      expectedVersion: luna.version,
      name: 'New Luna',
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().household.members).toContainEqual({ id: luna.id, name: 'New Luna' });
    const history = (await request('GET', `/v1/cats/${luna.id}/history`)).json();
    expect(
      history.homes.find((home: { version: number }) => home.version === before.household.version)
        .members,
    ).toContainEqual({ id: luna.id, name: 'Household Luna' });
    expect(
      (
        await request('POST', `/v1/cats/${luna.id}/household`, {
          expectedVersion: luna.version,
          livesWithCatId: milo.id,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('does not prefill older observations with newer facts or flag cosmetic changes as behavioral context', async () => {
    const cat = await create('Historical context');
    const updated = (
      await request('PATCH', `/v1/cats/${cat.id}`, {
        expectedVersion: cat.version,
        household: {
          expectedVersion: cat.household.version,
          facts: { children: 'yes', dogs: 'no', other_animals: 'no', totalCats: 'one' },
        },
      })
    ).json();
    const older = (
      await request('POST', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: 0,
        periodStart: '2020-01-01',
        periodEnd: '2020-01-20',
      })
    ).json();
    expect(older.answers).toEqual({});
    expect(older.prefilledQuestions).toEqual([]);
    let current = (
      await request('POST', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: older.revision,
        periodStart: start,
        periodEnd: today,
      })
    ).json();
    expect(current.answers.Q02).toEqual(['children']);
    await request('PATCH', `/v1/cats/${cat.id}`, {
      expectedVersion: updated.version,
      name: 'Renamed historical context',
    });
    current = (await request('GET', `/v1/cats/${cat.id}/portrait`)).json();
    expect(current.contextChangedAt).toBeNull();
    const renamed = (await request('GET', `/v1/cats/${cat.id}`)).json();
    await request('DELETE', `/v1/cats/${cat.id}`, { expectedVersion: renamed.version });
    expect(
      (await request('GET', `/v1/cats/${cat.id}/portrait`)).json().contextChangedAt,
    ).toBeNull();
  });

  it('validates observation dates, answer order and relationship targets without accepting unrelated IDs', async () => {
    const cat = await create('Target observer');
    const first = await create('First target', { livesWithCatId: cat.id });
    const second = await create('Second target', { livesWithCatId: cat.id });
    const unrelated = await create('Different home');
    for (const [periodStart, periodEnd] of [
      ['2026-02-30', '2026-03-01'],
      [start, '2099-01-01'],
      ['2000-01-01', today],
      [today, start],
    ]) {
      expect(
        (
          await request('POST', `/v1/cats/${cat.id}/portrait`, {
            expectedRevision: 0,
            periodStart,
            periodEnd,
          })
        ).statusCode,
      ).toBe(400);
    }
    let portrait = (
      await request('POST', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: 0,
        periodStart: start,
        periodEnd: today,
      })
    ).json();
    expect(
      (
        await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
          expectedRevision: portrait.revision,
          questionId: 'Q10',
          answer: 'often',
        })
      ).statusCode,
    ).toBe(400);
    for (const [questionId, answer] of [
      ['Q01', 'usual'],
      ['Q02', ['multiple_cats']],
      ['Q03', 'none'],
      ['Q04', 'often'],
      ['Q05', 'joins_play'],
      ['Q06', 'rests'],
      ['Q07', 'continues'],
      ['Q08', 'approaches_contact'],
      ['Q09', 'close'],
    ]) {
      const response = await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: portrait.revision,
        questionId,
        answer,
      });
      expect(response.statusCode).toBe(200);
      portrait = response.json();
    }
    for (const target of [cat.id, unrelated.id, randomUUID()])
      expect(
        (
          await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
            expectedRevision: portrait.revision,
            questionId: 'F_TARGET',
            answer: 'cat:' + target,
          })
        ).statusCode,
      ).toBe(400);
    for (const [questionId, answer] of [
      ['F_TARGET', 'cat:' + first.id],
      ['Q10', 'initiates_greeting'],
      ['Q11', 'stays'],
    ]) {
      const response = await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: portrait.revision,
        questionId,
        answer,
      });
      expect(response.statusCode).toBe(200);
      portrait = response.json();
    }
    const previousRevision = portrait.revision;
    const changed = await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
      expectedRevision: portrait.revision,
      questionId: 'F_TARGET',
      answer: 'cat:' + second.id,
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().answers.Q10).toBeUndefined();
    expect(changed.json().answers.Q11).toBeUndefined();
    expect(
      (await request('GET', `/v1/cats/${cat.id}/portrait/revisions/${previousRevision}`)).json()
        .answers.Q10,
    ).toBe('initiates_greeting');
    expect((await request('GET', `/v1/cats/${cat.id}/portrait/revisions/0`)).statusCode).toBe(400);
  });

  it('persists structured selections and deferred home facts without changing prior versions or other cats', async () => {
    const cat = await create('Structured profile');
    const old = await request('PATCH', `/v1/cats/${cat.id}`, {
      expectedVersion: cat.version,
      attributes: { games: 'Legacy note' },
    });
    const updated = await request('PATCH', `/v1/cats/${cat.id}`, {
      expectedVersion: old.json().version,
      attributes: { games: ['wand', 'balls'], handling: 'deferred' },
      household: {
        expectedVersion: cat.household.version,
        environment: { restPlaces: ['quiet', 'covered'] },
        facts: { children: 'deferred', dogs: 'no', other_animals: 'no', totalCats: 'one' },
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().attributes).toMatchObject({
      games: ['wand', 'balls'],
      handling: 'deferred',
    });
    const history = (await request('GET', `/v1/cats/${cat.id}/history`)).json();
    expect(history.cats[1].attributes.games).toBe('Legacy note');
    expect(
      (
        await request('PATCH', `/v1/cats/${cat.id}`, {
          expectedVersion: updated.json().version,
          attributes: { games: ['none', 'wand'] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          'PATCH',
          `/v1/cats/${cat.id}`,
          { expectedVersion: updated.json().version, attributes: { games: ['balls'] } },
          otherOwner,
        )
      ).statusCode,
    ).toBe(404);
    const started = (
      await request('POST', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: 0,
        periodStart: start,
        periodEnd: today,
      })
    ).json();
    expect(started.answers.Q02).toBeUndefined();
    const answered = (
      await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
        expectedRevision: started.revision,
        questionId: 'Q01',
        answer: 'usual',
      })
    ).json();
    expect(answered.assessmentId).toBe(started.assessmentId);
    expect(answered.result.description.version).toBe('cat-description-1');
    const rows = (await request('GET', `/v1/cats/${cat.id}/portrait/revisions`)).json();
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row: { assessmentId: string; profileStatus: string }) =>
          row.assessmentId === started.assessmentId && row.profileStatus,
      ),
    ).toBe(true);
    await database.portraitRevision.update({
      where: { catId_revision: { catId: cat.id, revision: answered.revision } },
      data: { rulesVersion: 'cat-portrait-draft-1' },
    });
    expect(
      (
        await request('PATCH', `/v1/cats/${cat.id}/portrait`, {
          expectedRevision: answered.revision,
          questionId: 'Q02',
          answer: ['none'],
        })
      ).statusCode,
    ).toBe(409);
  });

  it('erases all owned versions when the existing account-deletion lifecycle removes the owner', async () => {
    await database.user.delete({ where: { id: owner } });
    expect(await database.cat.count({ where: { ownerId: owner } })).toBe(0);
    expect(await database.catVersion.count()).toBe(0);
    expect(await database.householdVersion.count()).toBe(0);
    expect(await database.portraitRevision.count()).toBe(0);
    expect(await database.user.count({ where: { id: otherOwner } })).toBe(1);
  });
});
