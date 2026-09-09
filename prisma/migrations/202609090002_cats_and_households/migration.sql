-- CreateTable
CREATE TABLE "Household" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdVersion" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "facts" JSONB NOT NULL,
    "environment" JSONB NOT NULL,
    "members" JSONB NOT NULL,
    "changeKind" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "HouseholdVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cat" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "portraitRevision" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatVersion" (
    "id" UUID NOT NULL,
    "catId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "householdId" UUID NOT NULL,
    "photo" BYTEA,
    "photoVersion" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "changeKind" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "CatVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortraitRevision" (
    "id" UUID NOT NULL,
    "catId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "assessmentId" UUID NOT NULL,
    "respondentId" UUID NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "answers" JSONB NOT NULL,
    "followups" JSONB NOT NULL,
    "issuedFollowups" JSONB NOT NULL,
    "householdSnapshot" JSONB NOT NULL,
    "prefilledQuestions" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "contextChangedAt" TIMESTAMP(3),

    CONSTRAINT "PortraitRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Household_ownerId_idx" ON "Household"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Household_id_ownerId_key" ON "Household"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdVersion_householdId_version_key" ON "HouseholdVersion"("householdId", "version");

-- CreateIndex
CREATE INDEX "Cat_ownerId_idx" ON "Cat"("ownerId");

-- CreateIndex
CREATE INDEX "Cat_householdId_ownerId_idx" ON "Cat"("householdId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CatVersion_catId_version_key" ON "CatVersion"("catId", "version");

-- CreateIndex
CREATE INDEX "PortraitRevision_catId_assessmentId_idx" ON "PortraitRevision"("catId", "assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PortraitRevision_catId_revision_key" ON "PortraitRevision"("catId", "revision");

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdVersion" ADD CONSTRAINT "HouseholdVersion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cat" ADD CONSTRAINT "Cat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cat" ADD CONSTRAINT "Cat_householdId_ownerId_fkey" FOREIGN KEY ("householdId", "ownerId") REFERENCES "Household"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatVersion" ADD CONSTRAINT "CatVersion_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortraitRevision" ADD CONSTRAINT "PortraitRevision_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
