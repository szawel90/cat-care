-- CreateTable
CREATE TABLE "EmailAction" (
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAction_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "EmailAction_userId_idx" ON "EmailAction"("userId");

-- AddForeignKey
ALTER TABLE "EmailAction" ADD CONSTRAINT "EmailAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
