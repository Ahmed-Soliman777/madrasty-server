-- Safe, additive migration for versioned timetables.
-- Existing TimetableEntry IDs are preserved so AttendanceSession relations remain valid.
-- Conflict-specific unique indexes are intentionally deferred until the legacy audit is reviewed.

CREATE TYPE "TimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "TimetableGenerationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

ALTER TABLE "teacher_assignments"
ADD COLUMN "lessonsPerWeek" INTEGER;

-- Infer weekly requirements only from existing active entries.
-- Assignments without active entries remain NULL and must be configured by an administrator.
UPDATE "teacher_assignments" AS assignment
SET "lessonsPerWeek" = counts.lesson_count
FROM (
  SELECT "assignmentId", COUNT(*)::INTEGER AS lesson_count
  FROM "timetable_entries"
  WHERE "isActive" = TRUE
  GROUP BY "assignmentId"
) AS counts
WHERE assignment."id" = counts."assignmentId"
  AND assignment."lessonsPerWeek" IS NULL;

CREATE TABLE "timetables" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "TimetableStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "timetables_id_schoolId_key"
ON "timetables"("id", "schoolId");

CREATE UNIQUE INDEX "timetables_schoolId_academicYearId_version_key"
ON "timetables"("schoolId", "academicYearId", "version");

CREATE INDEX "timetables_schoolId_academicYearId_status_idx"
ON "timetables"("schoolId", "academicYearId", "status");

ALTER TABLE "timetables"
ADD CONSTRAINT "timetables_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timetables"
ADD CONSTRAINT "timetables_academicYearId_schoolId_fkey"
FOREIGN KEY ("academicYearId", "schoolId")
REFERENCES "academic_years"("id", "schoolId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetables"
ADD CONSTRAINT "timetables_createdById_schoolId_fkey"
FOREIGN KEY ("createdById", "schoolId")
REFERENCES "staff"("id", "schoolId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetables"
ADD CONSTRAINT "timetables_approvedById_schoolId_fkey"
FOREIGN KEY ("approvedById", "schoolId")
REFERENCES "staff"("id", "schoolId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "timetable_generation_jobs" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "timetableId" TEXT NOT NULL,
  "status" "TimetableGenerationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "algorithmVersion" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "resultSummary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "timetable_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "timetable_generation_jobs_schoolId_timetableId_createdAt_idx"
ON "timetable_generation_jobs"("schoolId", "timetableId", "createdAt");

CREATE INDEX "timetable_generation_jobs_status_createdAt_idx"
ON "timetable_generation_jobs"("status", "createdAt");

ALTER TABLE "timetable_generation_jobs"
ADD CONSTRAINT "timetable_generation_jobs_timetableId_schoolId_fkey"
FOREIGN KEY ("timetableId", "schoolId")
REFERENCES "timetables"("id", "schoolId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timetable_generation_jobs"
ADD CONSTRAINT "timetable_generation_jobs_requestedById_schoolId_fkey"
FOREIGN KEY ("requestedById", "schoolId")
REFERENCES "staff"("id", "schoolId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add the new foreign key as nullable first so legacy rows can be backfilled safely.
ALTER TABLE "timetable_entries"
ADD COLUMN "timetableId" TEXT;

-- Create one historical published version per school and academic year represented
-- by existing timetable entries. Do not invent historical approver or publication timestamps.
INSERT INTO "timetables" (
  "id", "schoolId", "academicYearId", "version", "status", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  grouped."schoolId",
  grouped."academicYearId",
  1,
  'PUBLISHED'::"TimetableStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT entry."schoolId", class."academicYearId"
  FROM "timetable_entries" AS entry
  INNER JOIN "classes" AS class
    ON class."id" = entry."classId"
   AND class."schoolId" = entry."schoolId"
) AS grouped;

UPDATE "timetable_entries" AS entry
SET "timetableId" = timetable."id"
FROM "classes" AS class
INNER JOIN "timetables" AS timetable
  ON timetable."schoolId" = class."schoolId"
 AND timetable."academicYearId" = class."academicYearId"
 AND timetable."version" = 1
WHERE class."id" = entry."classId"
  AND class."schoolId" = entry."schoolId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "timetable_entries" WHERE "timetableId" IS NULL) THEN
    RAISE EXCEPTION 'Safe timetable migration aborted: one or more legacy timetable entries could not be assigned to a historical timetable.';
  END IF;
END $$;

ALTER TABLE "timetable_entries"
ALTER COLUMN "timetableId" SET NOT NULL;

ALTER TABLE "timetable_entries"
ADD CONSTRAINT "timetable_entries_timetableId_schoolId_fkey"
FOREIGN KEY ("timetableId", "schoolId")
REFERENCES "timetables"("id", "schoolId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "timetable_entries_timetableId_idx"
ON "timetable_entries"("timetableId");

-- The old uniqueness rule prevents the same assignment from appearing in a new
-- timetable version. Version-scoped class/teacher conflict constraints are deferred
-- until the preflight report has been reviewed and legacy conflicts resolved.
ALTER TABLE "timetable_entries"
DROP CONSTRAINT IF EXISTS "timetable_entries_assignmentId_periodId_weekday_key";
