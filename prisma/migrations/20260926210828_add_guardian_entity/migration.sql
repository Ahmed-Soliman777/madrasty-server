/*
  Warnings:

  - You are about to drop the column `guardianName` on the `students` table. All the data in the column will be lost.
  - You are about to drop the column `guardianNameEn` on the `students` table. All the data in the column will be lost.
  - You are about to drop the column `guardianNationalId` on the `students` table. All the data in the column will be lost.
  - You are about to drop the column `guardianPhone` on the `students` table. All the data in the column will be lost.
  - Added the required column `guardianId` to the `students` table without a default value. This is not possible if the table is not empty.
  - Made the column `fullNameEn` on table `students` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "students_guardianNationalId_idx";

-- DropIndex
DROP INDEX "students_guardianPhone_idx";

-- DropIndex
DROP INDEX "students_nationalId_key";

-- AlterTable
ALTER TABLE "students" DROP COLUMN "guardianName",
DROP COLUMN "guardianNameEn",
DROP COLUMN "guardianNationalId",
DROP COLUMN "guardianPhone",
ADD COLUMN     "guardianId" TEXT NOT NULL,
ALTER COLUMN "fullNameEn" SET NOT NULL;

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "nationalId" TEXT,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fullNameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardians_nationalId_key" ON "guardians"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_phone_key" ON "guardians"("phone");

-- CreateIndex
CREATE INDEX "guardians_phone_idx" ON "guardians"("phone");

-- CreateIndex
CREATE INDEX "students_guardianId_idx" ON "students"("guardianId");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
