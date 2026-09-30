/*
  Warnings:

  - Added the required column `gradeEn` to the `classes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameEn` to the `classes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameEn` to the `schools` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "gradeEn" TEXT NOT NULL,
ADD COLUMN     "nameEn" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "addressEn" TEXT,
ADD COLUMN     "nameEn" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "fullNameEn" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "fullNameEn" TEXT,
ADD COLUMN     "guardianNameEn" TEXT;
