import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  barfCatalog,
  snapshotBarf,
  type BarfInput,
  type BarfRecipe,
  type BarfSnapshot,
} from '@cat-care/shared';
import { PrismaService } from '../prisma.service';
import type { Prisma } from '../generated/prisma/client';

const include = { revisions: { orderBy: { version: 'desc' as const } } };
type StoredRecipe = Prisma.BarfRecipeGetPayload<{ include: typeof include }>;

function present(recipe: StoredRecipe): BarfRecipe {
  return {
    id: recipe.id,
    currentVersion: recipe.currentVersion,
    archivedAt: recipe.archivedAt?.toISOString() ?? null,
    createdAt: recipe.createdAt.toISOString(),
    revisions: recipe.revisions.map((revision) => ({
      version: revision.version,
      createdAt: revision.createdAt.toISOString(),
      status:
        revision.version !== recipe.currentVersion
          ? 'superseded'
          : recipe.archivedAt
            ? 'withdrawn'
            : 'current',
      snapshot: revision.snapshot as unknown as BarfSnapshot,
    })),
  };
}

@Injectable()
export class BarfService {
  constructor(private readonly prisma: PrismaService) {}

  private snapshot(input: BarfInput): Prisma.InputJsonValue {
    try {
      if (!input || typeof input.title !== 'string' || !input.title.trim())
        throw new Error('BARF_INVALID_INPUT');
      const snapshot = snapshotBarf({
        ...input,
        title: input.title.trim(),
        catName: input.catName.trim(),
      });
      if (snapshot.result.meatGrams <= 0) throw new Error('BARF_NO_MEAT');
      return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
    } catch (error) {
      throw new BadRequestException({
        code: error instanceof Error ? error.message : 'BARF_INVALID_INPUT',
      });
    }
  }

  async list(userId: string) {
    return (
      await this.prisma.barfRecipe.findMany({
        where: { userId },
        include,
        orderBy: { updatedAt: 'desc' },
      })
    ).map(present);
  }

  async get(userId: string, id: string) {
    const recipe = await this.prisma.barfRecipe.findFirst({ where: { id, userId }, include });
    if (!recipe) throw new NotFoundException({ code: 'BARF_NOT_FOUND' });
    return present(recipe);
  }

  async create(userId: string, input: BarfInput) {
    const snapshot = this.snapshot(input);
    return present(
      await this.prisma.barfRecipe.create({
        data: { userId, revisions: { create: { version: 1, snapshot } } },
        include,
      }),
    );
  }

  async update(userId: string, id: string, expectedVersion: number, input?: BarfInput) {
    // Validate before opening the transaction. Never trust client-supplied totals.
    const snapshot = input ? this.snapshot(input) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.barfRecipe.findFirst({ where: { id, userId }, include });
      if (!existing) throw new NotFoundException({ code: 'BARF_NOT_FOUND' });
      if (existing.archivedAt || existing.currentVersion !== expectedVersion)
        throw new ConflictException({ code: 'BARF_VERSION_CONFLICT' });
      const changed = await tx.barfRecipe.updateMany({
        where: { id, userId, currentVersion: expectedVersion, archivedAt: null },
        data: { currentVersion: { increment: 1 }, ...(input ? {} : { archivedAt: new Date() }) },
      });
      if (changed.count !== 1) throw new ConflictException({ code: 'BARF_VERSION_CONFLICT' });
      await tx.barfRecipeRevision.create({
        data: {
          recipeId: id,
          version: expectedVersion + 1,
          snapshot: snapshot ?? (existing.revisions[0]!.snapshot as Prisma.InputJsonValue),
        },
      });
      return present(await tx.barfRecipe.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  async favorites(userId: string) {
    return {
      ingredientIds:
        (await this.prisma.barfPreferences.findUnique({ where: { userId } }))?.ingredientIds ?? [],
    };
  }
  async saveFavorites(userId: string, ingredientIds: string[]) {
    if (
      ingredientIds.some(
        (id) => !barfCatalog.ingredients.some((ingredient) => ingredient.id === id),
      )
    )
      throw new BadRequestException({ code: 'BARF_UNKNOWN_INGREDIENT' });
    const ids = [...new Set(ingredientIds)];
    await this.prisma.barfPreferences.upsert({
      where: { userId },
      create: { userId, ingredientIds: ids },
      update: { ingredientIds: ids },
    });
    return { ingredientIds: ids };
  }
}
