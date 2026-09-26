/*
  Warnings:

  - A unique constraint covering the columns `[nationalId]` on the table `students` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "students_nationalId_key" ON "students"("nationalId");
