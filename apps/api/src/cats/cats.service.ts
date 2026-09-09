import { appendCatVersion, appendHouseholdVersion } from './cat-version-store';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  applyPortraitAnswer,
  calculatePortrait,
  factsFromHouseholdAnswer,
  householdAnswer,
  nextQuestion,
  portraitVersion,
  profileFields,
  unknownHousehold,
  validateAttributes,
  validateHousehold,
  type CatAttributes,
  type CatEvent,
  type CatRecord,
  type HouseholdFacts,
  type PortraitAnswers,
  type PortraitFollowups,
  type PortraitRecord,
  type PortraitResult,
} from '@cat-care/shared';
import { PrismaService } from '../prisma.service';
import { Prisma, type PortraitRevision } from '../generated/prisma/client';
import type {
  AnswerPortraitDto,
  CreateCatDto,
  MoveCatDto,
  StartPortraitDto,
  UpdateCatDto,
} from './cats.dto';

const include = {
  versions: { take: 1, orderBy: { version: 'desc' as const } },
  household: {
    include: {
      versions: { take: 1, orderBy: { version: 'desc' as const } },
      cats: {
        include: {
          versions: { take: 1, orderBy: { version: 'desc' as const }, select: { name: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  portraits: { take: 1, orderBy: { revision: 'desc' as const }, select: { result: true } },
};
type StoredCat = Prisma.CatGetPayload<{ include: typeof include }>;
function flatten(cat: StoredCat) {
  const data = cat.versions[0]!,
    home = cat.household.versions[0]!;
  return {
    ...cat,
    name: data.name,
    photo: data.photo,
    photoVersion: data.photoVersion,
    attributes: data.attributes,
    events: data.events,
    household: {
      ...cat.household,
      facts: home.facts,
      environment: home.environment,
      cats: cat.household.cats.map((member) => ({ id: member.id, name: member.versions[0]!.name })),
    },
  };
}
type LoadedCat = ReturnType<typeof flatten>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const date = (value: Date) => value.toISOString().slice(0, 10);
const conflict = () => new ConflictException('The record changed. Reload before saving.');

export async function normalizeCatPhoto(dataUrl: string): Promise<Buffer> {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || dataUrl.length > 750_000)
    throw new BadRequestException('Use a JPEG, PNG or WebP photo.');
  try {
    const data = Buffer.from(match[2]!, 'base64');
    if (!data.length || data.length > 550_000) throw new Error();
    const source = sharp(data, {
      limitInputPixels: 16_000_000,
      animated: false,
      failOn: 'warning',
    });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
      throw new Error();
    // Re-encode pixels to remove metadata and untrusted attached payloads.
    return await source
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new BadRequestException('The photo could not be read.');
  }
}

@Injectable()
export class CatsService {
  constructor(private readonly prisma: PrismaService) {}

  private dto(cat: LoadedCat): CatRecord {
    return {
      id: cat.id,
      name: cat.name,
      version: cat.version,
      photoVersion: cat.photoVersion,
      hasPhoto: Boolean(cat.photo),
      attributes: cat.attributes as CatAttributes,
      events: cat.events as unknown as CatEvent[],
      household: {
        id: cat.household.id,
        version: cat.household.version,
        facts: { ...unknownHousehold, ...(cat.household.facts as object) },
        environment: cat.household.environment as CatAttributes,
        members: cat.household.cats,
        updatedAt: cat.household.updatedAt.toISOString(),
      },
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
      archivedAt: cat.archivedAt?.toISOString() ?? null,
      portraitStatus:
        (cat.portraits[0]?.result as PortraitResult | undefined)?.profile_status ?? 'not_started',
    };
  }

  async find(ownerId: string, id: string) {
    const cat = await this.prisma.cat.findFirst({ where: { id, ownerId }, include });
    if (!cat) throw new NotFoundException('Cat not found.');
    return flatten(cat);
  }
  async list(ownerId: string, archived = false) {
    return (
      await this.prisma.cat.findMany({
        where: { ownerId, archivedAt: archived ? { not: null } : null },
        include,
        orderBy: { createdAt: 'asc' },
      })
    ).map((cat) => this.dto(flatten(cat)));
  }
  async get(ownerId: string, id: string) {
    return this.dto(await this.find(ownerId, id));
  }

  async create(ownerId: string, data: CreateCatDto) {
    const photo = data.photoDataUrl
      ? new Uint8Array(await normalizeCatPhoto(data.photoDataUrl))
      : null;
    const created = await this.prisma.$transaction(async (tx) => {
      let householdId: string;
      if (data.livesWithCatId) {
        const other = await tx.cat.findFirst({
          where: { id: data.livesWithCatId, ownerId, archivedAt: null },
        });
        if (!other) throw new NotFoundException('Housemate not found.');
        householdId = other.householdId;
      } else householdId = (await tx.household.create({ data: { ownerId } })).id;
      const cat = await tx.cat.create({ data: { ownerId, householdId } });
      await appendCatVersion(tx, ownerId, cat.id, 0, 'created', { name: data.name, photo });
      await appendHouseholdVersion(tx, ownerId, householdId, 'member_joined');
      return cat;
    });
    return this.get(ownerId, created.id);
  }

  async update(ownerId: string, id: string, data: UpdateCatDto) {
    const current = await this.find(ownerId, id);
    if (current.archivedAt) throw new BadRequestException('Restore this cat before editing.');
    let attributes: CatAttributes | undefined,
      environment: CatAttributes | undefined,
      facts: HouseholdFacts | undefined;
    try {
      if (data.attributes) attributes = validateAttributes(data.attributes);
      if (data.household?.environment)
        environment = validateAttributes(
          data.household.environment,
          profileFields.home.filter((key) => key !== 'access'),
        );
      if (data.household?.facts) facts = validateHousehold(data.household.facts);
      if (data.events) {
        if (data.events.length > 100) throw new Error();
        const ids = new Set<string>();
        for (const event of data.events) {
          if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error();
          const item = event as Record<string, unknown>;
          if (
            Object.keys(item).some((key) => !['id', 'date', 'title', 'details'].includes(key)) ||
            typeof item.id !== 'string' ||
            !/^[a-f0-9-]{36}$/i.test(item.id) ||
            ids.has(item.id) ||
            typeof item.date !== 'string' ||
            item.date.length > 80 ||
            typeof item.title !== 'string' ||
            !item.title.trim() ||
            item.title.length > 200 ||
            typeof item.details !== 'string' ||
            item.details.length > 1500
          )
            throw new Error();
          ids.add(item.id);
        }
      }
    } catch {
      throw new BadRequestException('Invalid profile data.');
    }
    const photo =
      data.photoDataUrl === undefined
        ? undefined
        : data.photoDataUrl === null
          ? null
          : new Uint8Array(await normalizeCatPhoto(data.photoDataUrl));
    await this.prisma.$transaction(async (tx) => {
      await appendCatVersion(tx, ownerId, id, data.expectedVersion, 'profile_updated', {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(attributes ? { attributes: { ...(current.attributes as object), ...attributes } } : {}),
        ...(data.events ? { events: data.events } : {}),
        ...(photo !== undefined ? { photo } : {}),
      });
      if (data.name !== undefined && data.name !== current.name && !data.household)
        await appendHouseholdVersion(tx, ownerId, current.householdId, 'member_renamed');
      if (data.household)
        await appendHouseholdVersion(tx, ownerId, current.householdId, 'facts_updated', {
          expectedVersion: data.household.expectedVersion,
          facts,
          ...(environment
            ? { environment: { ...(current.household.environment as object), ...environment } }
            : {}),
        });
    });
    return this.get(ownerId, id);
  }

  async move(ownerId: string, id: string, data: MoveCatDto) {
    const current = await this.find(ownerId, id);
    if (current.version !== data.expectedVersion) throw conflict();
    if (current.archivedAt || data.livesWithCatId === id)
      throw new BadRequestException('Choose another active cat.');
    await this.prisma.$transaction(async (tx) => {
      let householdId: string;
      if (data.livesWithCatId) {
        const other = await tx.cat.findFirst({
          where: { id: data.livesWithCatId, ownerId, archivedAt: null },
        });
        if (!other) throw new NotFoundException('Housemate not found.');
        householdId = other.householdId;
      } else householdId = (await tx.household.create({ data: { ownerId } })).id;
      if (householdId === current.householdId) return;
      await appendCatVersion(tx, ownerId, id, data.expectedVersion, 'home_changed', {
        householdId,
      });
      for (const homeId of [current.householdId, householdId].sort())
        await appendHouseholdVersion(
          tx,
          ownerId,
          homeId,
          homeId === current.householdId ? 'member_left' : 'member_joined',
          { leaving: homeId === current.householdId },
        );
    });
    return this.get(ownerId, id);
  }

  async archive(ownerId: string, id: string, expectedVersion: number, archived = true) {
    const current = await this.find(ownerId, id);
    await this.prisma.$transaction(async (tx) => {
      await appendCatVersion(tx, ownerId, id, expectedVersion, archived ? 'archived' : 'restored', {
        archived,
      });
      if (Boolean(current.archivedAt) !== archived)
        await appendHouseholdVersion(
          tx,
          ownerId,
          current.householdId,
          archived ? 'member_archived' : 'member_restored',
        );
    });
    return this.get(ownerId, id);
  }
  async photo(ownerId: string, id: string, version?: number) {
    if (version !== undefined && version < 1) throw new BadRequestException('Invalid version.');
    const cat = await this.prisma.cat.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!cat) throw new NotFoundException('Photo not found.');
    const row = await this.prisma.catVersion.findFirst({
      where: { catId: id, ...(version ? { version } : {}) },
      orderBy: { version: 'desc' },
    });
    if (!row?.photo) throw new NotFoundException('Photo not found.');
    return Buffer.from(row.photo);
  }
  async profileHistory(ownerId: string, id: string) {
    await this.find(ownerId, id);
    const versions = await this.prisma.catVersion.findMany({
      where: { catId: id },
      orderBy: { version: 'desc' },
    });
    const homes = await this.prisma.householdVersion.findMany({
      where: {
        householdId: { in: [...new Set(versions.map((row) => row.householdId))] },
        household: { ownerId },
      },
      orderBy: { recordedAt: 'desc' },
    });
    return {
      cats: versions.map(({ photo, ...row }) => ({ ...row, hasPhoto: Boolean(photo) })),
      homes,
    };
  }
  async exportData(ownerId: string) {
    const cats = await this.prisma.cat.findMany({
      where: { ownerId },
      include: {
        versions: { orderBy: { version: 'asc' } },
        portraits: { orderBy: { revision: 'asc' } },
      },
    });
    const households = await this.prisma.household.findMany({
      where: { ownerId },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
    return {
      cats: cats.map((cat) => ({
        ...cat,
        versions: cat.versions.map(({ photo, ...row }) => ({
          ...row,
          photoDataUrl: photo
            ? 'data:image/webp;base64,' + Buffer.from(photo).toString('base64')
            : null,
        })),
      })),
      households,
    };
  }

  private portraitDto(row: PortraitRevision): PortraitRecord {
    return {
      catId: row.catId,
      revision: row.revision,
      assessmentId: row.assessmentId,
      recordedAt: row.recordedAt.toISOString(),
      periodStart: date(row.periodStart),
      periodEnd: date(row.periodEnd),
      answers: row.answers as PortraitAnswers,
      followups: row.followups as PortraitFollowups,
      result: row.result as unknown as PortraitResult,
      householdSnapshot: row.householdSnapshot,
      prefilledQuestions: row.prefilledQuestions as string[],
      isCurrent: row.isCurrent,
      supersededAt: row.supersededAt?.toISOString() ?? null,
      contextChangedAt: row.contextChangedAt?.toISOString() ?? null,
    };
  }
  async portrait(ownerId: string, id: string, revision?: number) {
    if (revision !== undefined && revision < 1) throw new BadRequestException('Invalid revision.');
    await this.find(ownerId, id);
    const row = await this.prisma.portraitRevision.findFirst({
      where: { catId: id, ...(revision ? { revision } : {}) },
      orderBy: { revision: 'desc' },
    });
    if (revision && !row) throw new NotFoundException('Observation not found.');
    return row ? this.portraitDto(row) : null;
  }
  async history(ownerId: string, id: string) {
    await this.find(ownerId, id);
    return this.prisma.portraitRevision.findMany({
      where: { catId: id },
      orderBy: { revision: 'desc' },
      select: {
        revision: true,
        assessmentId: true,
        recordedAt: true,
        periodStart: true,
        periodEnd: true,
      },
    });
  }

  async startPortrait(ownerId: string, id: string, data: StartPortraitDto) {
    const cat = await this.find(ownerId, id);
    if (cat.archivedAt)
      throw new BadRequestException('Restore this cat before recording observations.');
    const start = new Date(data.periodStart),
      end = new Date(data.periodEnd);
    if (
      ![data.periodStart, data.periodEnd].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      date(start) !== data.periodStart ||
      date(end) !== data.periodEnd ||
      start > end ||
      data.periodEnd > date(new Date()) ||
      end.getTime() - start.getTime() > 27 * 86_400_000
    )
      throw new BadRequestException(
        'Choose an observation period of up to 28 days, ending no later than today.',
      );
    const home = this.dto(cat).household;
    // Current household facts must not be projected into an earlier observation period.
    const prefill =
      home.updatedAt.slice(0, 10) <= data.periodEnd
        ? householdAnswer(home.facts, home.members.length)
        : null;
    const answers: PortraitAnswers = prefill ? { Q02: prefill } : {};
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.cat.updateMany({
        where: { id, ownerId, portraitRevision: data.expectedRevision },
        data: { portraitRevision: { increment: 1 } },
      });
      if (!changed.count) throw conflict();
      await tx.portraitRevision.updateMany({
        where: { catId: id, isCurrent: true },
        data: { isCurrent: false, supersededAt: new Date() },
      });
      await tx.portraitRevision.create({
        data: {
          catId: id,
          revision: data.expectedRevision + 1,
          assessmentId: randomUUID(),
          respondentId: ownerId,
          rulesVersion: portraitVersion,
          periodStart: start,
          periodEnd: end,
          answers: json(answers),
          followups: {},
          issuedFollowups: [],
          householdSnapshot: json(home),
          prefilledQuestions: prefill ? ['Q02'] : [],
          result: json(calculatePortrait(answers)),
        },
      });
    });
    return (await this.portrait(ownerId, id))!;
  }

  async answer(ownerId: string, id: string, data: AnswerPortraitDto) {
    const cat = await this.find(ownerId, id);
    if (cat.archivedAt)
      throw new BadRequestException('Restore this cat before recording observations.');
    const previous = await this.prisma.portraitRevision.findFirst({
      where: { catId: id },
      orderBy: { revision: 'desc' },
    });
    if (
      !previous ||
      previous.revision !== data.expectedRevision ||
      previous.respondentId !== ownerId
    )
      throw conflict();
    let updated: ReturnType<typeof applyPortraitAnswer>;
    const answers = previous.answers as PortraitAnswers,
      followups = previous.followups as PortraitFollowups;
    const issued = previous.issuedFollowups as string[];
    const idIsFollowup = data.questionId.startsWith('F_');
    try {
      const expected = nextQuestion(answers, followups, issued);
      if (
        !Object.hasOwn(answers, data.questionId) &&
        !Object.hasOwn(followups, data.questionId) &&
        expected?.id !== data.questionId
      )
        throw new Error();
      if (idIsFollowup && !issued.includes(data.questionId) && issued.length >= 2)
        throw new Error();
      if (!(typeof data.answer === 'string' || Array.isArray(data.answer))) throw new Error();
      updated = applyPortraitAnswer(
        answers,
        followups,
        data.questionId,
        data.answer as string | string[],
        issued,
      );
    } catch {
      throw new BadRequestException('The answer does not match the current observation.');
    }
    if (
      data.questionId === 'F_TARGET' &&
      typeof data.answer === 'string' &&
      data.answer.startsWith('cat:')
    ) {
      const target = data.answer.slice(4);
      const snapshot = previous.householdSnapshot as unknown as CatRecord['household'];
      if (
        target === id ||
        !snapshot.members.some((member) => member.id === target) ||
        !(await this.prisma.cat.findFirst({ where: { id: target, ownerId } }))
      )
        throw new BadRequestException('Choose a cat from the observed household.');
    }
    const prefills = (previous.prefilledQuestions as string[]).filter(
      (key) => key !== data.questionId,
    );
    const newFacts =
      data.questionId === 'Q02' ? factsFromHouseholdAnswer(updated.answers.Q02 as string[]) : null;
    const snapshot = previous.householdSnapshot as unknown as CatRecord['household'];
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.cat.updateMany({
        where: { id, ownerId, portraitRevision: data.expectedRevision },
        data: { portraitRevision: { increment: 1 } },
      });
      if (!changed.count) throw conflict();
      // Historical observation answers must not overwrite a newer or different household.
      if (
        newFacts &&
        date(previous.periodEnd) === date(new Date()) &&
        snapshot.id === cat.householdId
      ) {
        const head = await tx.household.findFirst({ where: { id: snapshot.id, ownerId } });
        if (head?.version === snapshot.version) {
          const saved = await appendHouseholdVersion(
            tx,
            ownerId,
            snapshot.id,
            'interview_context_updated',
            { expectedVersion: snapshot.version, facts: newFacts },
          );
          snapshot.facts = saved.facts;
          snapshot.version = saved.version;
        }
      }
      await tx.portraitRevision.updateMany({
        where: { catId: id, isCurrent: true },
        data: { isCurrent: false, supersededAt: new Date() },
      });
      await tx.portraitRevision.create({
        data: {
          catId: id,
          revision: previous.revision + 1,
          assessmentId: previous.assessmentId,
          respondentId: ownerId,
          rulesVersion: previous.rulesVersion,
          periodStart: previous.periodStart,
          periodEnd: previous.periodEnd,
          answers: json(updated.answers),
          followups: json(updated.followups),
          issuedFollowups: json([
            ...new Set([...issued, ...(idIsFollowup ? [data.questionId] : [])]),
          ]),
          householdSnapshot: json(snapshot),
          prefilledQuestions: prefills,
          contextChangedAt: previous.contextChangedAt,
          result: json(
            calculatePortrait(updated.answers, updated.followups, [
              ...new Set([...issued, ...(idIsFollowup ? [data.questionId] : [])]),
            ]),
          ),
        },
      });
    });
    return (await this.portrait(ownerId, id))!;
  }
}
