import { ConflictException } from '@nestjs/common';
import { unknownHousehold, type HouseholdFacts } from '@cat-care/shared';
import { Prisma } from '../generated/prisma/client';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type CatChanges = {
  name?: string;
  householdId?: string;
  photo?: Uint8Array<ArrayBuffer> | null;
  attributes?: object;
  events?: unknown[];
  archived?: boolean;
};

export async function appendCatVersion(
  tx: Prisma.TransactionClient,
  ownerId: string,
  catId: string,
  expectedVersion: number,
  changeKind: string,
  changes: CatChanges,
) {
  const previous = await tx.catVersion.findFirst({
    where: { catId },
    orderBy: { version: 'desc' },
  });
  const head = await tx.cat.findFirst({ where: { id: catId, ownerId } });
  if (!head || head.version !== expectedVersion)
    throw new ConflictException('The record changed. Reload before saving.');
  const now = new Date();
  const archived = changes.archived ?? previous?.archived ?? false;
  const householdId = changes.householdId ?? head.householdId;
  const changed = await tx.cat.updateMany({
    where: { id: catId, ownerId, version: expectedVersion },
    data: {
      version: { increment: 1 },
      householdId,
      archivedAt: archived ? (head.archivedAt ?? now) : null,
    },
  });
  if (!changed.count) throw new ConflictException('The record changed. Reload before saving.');
  // Only lifecycle flags change on earlier versions; their collected payload is immutable.
  await tx.catVersion.updateMany({
    where: { catId, isCurrent: true },
    data: { isCurrent: false, supersededAt: now },
  });
  await tx.catVersion.create({
    data: {
      catId,
      version: expectedVersion + 1,
      name: changes.name ?? previous!.name,
      householdId,
      photo: changes.photo !== undefined ? changes.photo : (previous?.photo ?? null),
      photoVersion: (previous?.photoVersion ?? 0) + (changes.photo !== undefined ? 1 : 0),
      attributes: json(changes.attributes ?? previous?.attributes ?? {}),
      events: json(changes.events ?? previous?.events ?? []),
      archived,
      changeKind,
      recordedAt: now,
    },
  });
  if (
    (changes.attributes &&
      JSON.stringify(changes.attributes) !== JSON.stringify(previous?.attributes)) ||
    changes.householdId
  ) {
    await tx.portraitRevision.updateMany({
      where: { catId, contextChangedAt: null },
      data: { contextChangedAt: now },
    });
  }
}

export async function appendHouseholdVersion(
  tx: Prisma.TransactionClient,
  ownerId: string,
  householdId: string,
  changeKind: string,
  updates: {
    expectedVersion?: number;
    facts?: HouseholdFacts;
    environment?: object;
    leaving?: boolean;
  } = {},
) {
  const head = await tx.household.findFirst({ where: { id: householdId, ownerId } });
  if (!head || (updates.expectedVersion !== undefined && head.version !== updates.expectedVersion))
    throw new ConflictException('The home changed. Reload before saving.');
  const previous = await tx.householdVersion.findFirst({
    where: { householdId },
    orderBy: { version: 'desc' },
  });
  const cats = await tx.cat.findMany({
    where: { householdId, ownerId },
    include: { versions: { take: 1, orderBy: { version: 'desc' } } },
  });
  const facts: HouseholdFacts = {
    ...unknownHousehold,
    ...(updates.facts ?? (previous?.facts as object) ?? {}),
  };
  if (updates.leaving)
    facts.totalCats =
      facts.totalCats === 'two'
        ? 'one'
        : facts.totalCats === 'three_or_more'
          ? 'unknown'
          : facts.totalCats;
  if (cats.length >= 3) facts.totalCats = 'three_or_more';
  else if (cats.length === 2 && ['unknown', 'one'].includes(facts.totalCats))
    facts.totalCats = 'two';
  const now = new Date();
  const changed = await tx.household.updateMany({
    where: { id: householdId, ownerId, version: head.version },
    data: { version: { increment: 1 } },
  });
  if (!changed.count) throw new ConflictException('The home changed. Reload before saving.');
  await tx.householdVersion.updateMany({
    where: { householdId, isCurrent: true },
    data: { isCurrent: false, supersededAt: now },
  });
  await tx.householdVersion.create({
    data: {
      householdId,
      version: head.version + 1,
      facts: json(facts),
      environment: json(updates.environment ?? previous?.environment ?? {}),
      members: cats.map((cat) => ({ id: cat.id, name: cat.versions[0]!.name })),
      changeKind,
      recordedAt: now,
    },
  });
  if (!['member_renamed', 'member_archived', 'member_restored'].includes(changeKind)) {
    await tx.portraitRevision.updateMany({
      where: { catId: { in: cats.map((cat) => cat.id) }, contextChangedAt: null },
      data: { contextChangedAt: now },
    });
  }
  return { version: head.version + 1, facts };
}
