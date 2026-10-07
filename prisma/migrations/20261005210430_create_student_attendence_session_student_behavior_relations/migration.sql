/*
  Warnings:

  - You are about to drop the `_TeacherClasses` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[id,schoolId]` on the table `classes` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[schoolId,academicYearId,nameEn]` on the table `classes` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,schoolId]` on the table `staff` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,schoolId]` on the table `students` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `academicYearId` to the `classes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT');

-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('OPEN', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "BehaviorKind" AS ENUM ('POSITIVE', 'NEGATIVE');

-- DropForeignKey
ALTER TABLE "_TeacherClasses" DROP CONSTRAINT "_TeacherClasses_A_fkey";

-- DropForeignKey
ALTER TABLE "_TeacherClasses" DROP CONSTRAINT "_TeacherClasses_B_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_classId_fkey";

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "academicYearId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo';

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "_TeacherClasses";

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "timetableEntryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'OPEN',
    "takenById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "isExcused" BOOLEAN NOT NULL DEFAULT false,
    "excuseNote" TEXT,
    "markedById" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_categories" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "BehaviorKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavior_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_records" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "sessionId" TEXT,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,

    CONSTRAINT "behavior_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_years_schoolId_isCurrent_idx" ON "academic_years"("schoolId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_id_schoolId_key" ON "academic_years"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_schoolId_nameEn_key" ON "academic_years"("schoolId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_id_schoolId_key" ON "subjects"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_schoolId_nameEn_key" ON "subjects"("schoolId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "periods_id_schoolId_key" ON "periods"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "periods_schoolId_number_key" ON "periods"("schoolId", "number");

-- CreateIndex
CREATE INDEX "teacher_assignments_schoolId_staffId_idx" ON "teacher_assignments"("schoolId", "staffId");

-- CreateIndex
CREATE INDEX "teacher_assignments_classId_idx" ON "teacher_assignments"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_id_schoolId_staffId_classId_key" ON "teacher_assignments"("id", "schoolId", "staffId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_staffId_classId_subjectId_key" ON "teacher_assignments"("staffId", "classId", "subjectId");

-- CreateIndex
CREATE INDEX "timetable_entries_staffId_weekday_idx" ON "timetable_entries"("staffId", "weekday");

-- CreateIndex
CREATE INDEX "timetable_entries_classId_weekday_idx" ON "timetable_entries"("classId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_id_schoolId_key" ON "timetable_entries"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_assignmentId_periodId_weekday_key" ON "timetable_entries"("assignmentId", "periodId", "weekday");

-- CreateIndex
CREATE INDEX "attendance_sessions_schoolId_date_idx" ON "attendance_sessions"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_id_schoolId_key" ON "attendance_sessions"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_timetableEntryId_date_key" ON "attendance_sessions"("timetableEntryId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_studentId_markedAt_idx" ON "attendance_records"("studentId", "markedAt");

-- CreateIndex
CREATE INDEX "attendance_records_schoolId_status_idx" ON "attendance_records"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_sessionId_studentId_key" ON "attendance_records"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_categories_id_schoolId_key" ON "behavior_categories"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_categories_schoolId_code_key" ON "behavior_categories"("schoolId", "code");

-- CreateIndex
CREATE INDEX "behavior_records_studentId_createdAt_idx" ON "behavior_records"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "behavior_records_sessionId_idx" ON "behavior_records"("sessionId");

-- CreateIndex
CREATE INDEX "behavior_records_schoolId_createdAt_idx" ON "behavior_records"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "classes_academicYearId_idx" ON "classes"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_id_schoolId_key" ON "classes"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_schoolId_academicYearId_nameEn_key" ON "classes"("schoolId", "academicYearId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "staff_id_schoolId_key" ON "staff"("id", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "students_id_schoolId_key" ON "students"("id", "schoolId");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academicYearId_schoolId_fkey" FOREIGN KEY ("academicYearId", "schoolId") REFERENCES "academic_years"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "classes"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_staffId_schoolId_fkey" FOREIGN KEY ("staffId", "schoolId") REFERENCES "staff"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_classId_schoolId_fkey" FOREIGN KEY ("classId", "schoolId") REFERENCES "classes"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "subjects"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_assignmentId_schoolId_staffId_classId_fkey" FOREIGN KEY ("assignmentId", "schoolId", "staffId", "classId") REFERENCES "teacher_assignments"("id", "schoolId", "staffId", "classId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_periodId_schoolId_fkey" FOREIGN KEY ("periodId", "schoolId") REFERENCES "periods"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_timetableEntryId_schoolId_fkey" FOREIGN KEY ("timetableEntryId", "schoolId") REFERENCES "timetable_entries"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_takenById_schoolId_fkey" FOREIGN KEY ("takenById", "schoolId") REFERENCES "staff"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_schoolId_fkey" FOREIGN KEY ("sessionId", "schoolId") REFERENCES "attendance_sessions"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "students"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_markedById_schoolId_fkey" FOREIGN KEY ("markedById", "schoolId") REFERENCES "staff"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_categories" ADD CONSTRAINT "behavior_categories_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "students"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_categoryId_schoolId_fkey" FOREIGN KEY ("categoryId", "schoolId") REFERENCES "behavior_categories"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "staff"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
