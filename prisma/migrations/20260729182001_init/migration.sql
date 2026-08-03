-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "source" TEXT,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "city" TEXT,
    "location" TEXT,
    "address" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "grade" TEXT NOT NULL DEFAULT 'D',
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "instagram" TEXT,
    "site" TEXT,
    "weakSite" BOOLEAN NOT NULL DEFAULT true,
    "googleRating" TEXT,
    "googleReviews" TEXT,
    "followers" INTEGER,
    "problem" TEXT,
    "offer" TEXT,
    "approach" TEXT,
    "nextAction" TEXT,
    "reason" TEXT,
    "mapsLink" TEXT,
    "bio" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'novo',
    "notes" TEXT NOT NULL DEFAULT '',
    "proposalValue" INTEGER NOT NULL DEFAULT 0,
    "landingStatus" TEXT NOT NULL DEFAULT 'none',
    "followUpAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_externalId_key" ON "Lead"("externalId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_grade_idx" ON "Lead"("grade");
