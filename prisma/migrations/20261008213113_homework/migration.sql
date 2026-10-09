-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Weekday" ADD VALUE 'FRIDAY';
ALTER TYPE "Weekday" ADD VALUE 'SATURDAY';

-- CreateTable
CREATE TABLE "homework" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "homework_no_duplicate_active"
  ON "homework" ("assignmentId", "dueAt", "title") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "homework_classId_dueAt_idx" ON "homework"("classId", "dueAt");

-- CreateIndex
CREATE INDEX "homework_staffId_dueAt_idx" ON "homework"("staffId", "dueAt");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_assignmentId_schoolId_staffId_classId_fkey" FOREIGN KEY ("assignmentId", "schoolId", "staffId", "classId") REFERENCES "teacher_assignments"("id", "schoolId", "staffId", "classId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "homework"
  ADD CONSTRAINT "homework_title_check" CHECK (char_length(btrim("title")) > 0),
  ADD CONSTRAINT "homework_due_check" CHECK ("dueAt" > "createdAt");