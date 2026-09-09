CREATE TABLE "BarfRecipe" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "BarfRecipe_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BarfRecipeRevision" (
    "id" UUID NOT NULL,
    "recipeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    CONSTRAINT "BarfRecipeRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BarfPreferences" (
    "userId" UUID NOT NULL,
    "ingredientIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "BarfPreferences_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "BarfRecipe_userId_updatedAt_idx" ON "BarfRecipe"("userId", "updatedAt");
CREATE UNIQUE INDEX "BarfRecipeRevision_recipeId_version_key" ON "BarfRecipeRevision"("recipeId", "version");
ALTER TABLE "BarfRecipe" ADD CONSTRAINT "BarfRecipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarfRecipeRevision" ADD CONSTRAINT "BarfRecipeRevision_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "BarfRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarfPreferences" ADD CONSTRAINT "BarfPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
