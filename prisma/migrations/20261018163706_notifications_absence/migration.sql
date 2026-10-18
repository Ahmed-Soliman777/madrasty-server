-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STUDENT_ABSENT';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "studentId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_sessionId_idx" ON "notifications"("sessionId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_student_session_pair_check"
    CHECK (("studentId" IS NULL) = ("sessionId" IS NULL)),
  ADD CONSTRAINT "notifications_single_source_check"
    CHECK (("homeworkId" IS NOT NULL) <> ("sessionId" IS NOT NULL));