-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('HOMEWORK_ASSIGNED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- DropIndex
DROP INDEX "behavior_records_sessionId_idx";

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "homeworkId" TEXT,
    "createdById" TEXT NOT NULL,
    "sendAfter" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "statusReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_status_sendAfter_idx" ON "notifications"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "notifications_homeworkId_idx" ON "notifications"("homeworkId");

-- CreateIndex
CREATE INDEX "notifications_guardianId_createdAt_idx" ON "notifications"("guardianId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_schoolId_createdAt_idx" ON "notifications"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_homework_ref_check"
    CHECK ("type" <> 'HOMEWORK_ASSIGNED' OR "homeworkId" IS NOT NULL),
  ADD CONSTRAINT "notifications_sent_check"
    CHECK (("status" = 'SENT') = ("sentAt" IS NOT NULL)),
  ADD CONSTRAINT "notifications_sent_body_check"
    CHECK ("status" <> 'SENT' OR "body" IS NOT NULL),
  ADD CONSTRAINT "notifications_attempts_check" CHECK ("attempts" >= 0);