import { Inject, Injectable } from "@nestjs/common";
import { ClockService } from "../common/clock.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  NOTIFICATIONS_CONFIG,
  type NotificationsConfig,
} from "./notifications.config.js";

@Injectable()
export class NotificationsService {
  constructor(
    private clock: ClockService,
    @Inject(NOTIFICATIONS_CONFIG) private config: NotificationsConfig,
  ) {}

  async enqueueHomeworkAssigned(
    tx: Prisma.TransactionClient,
    p: {
      schoolId: string;
      homeworkId: string;
      classId: string;
      createdById: string;
    },
  ): Promise<number> {
    const guardians = await tx.student.findMany({
      where: { schoolId: p.schoolId, classId: p.classId, isActive: true },
      select: { guardianId: true },
      distinct: ["guardianId"],
    });
    const now = this.clock.now();
    const result = await tx.notification.createMany({
      data: guardians.map((g) => ({
        schoolId: p.schoolId,
        type: "HOMEWORK_ASSIGNED" as const,
        dedupeKey: `HOMEWORK_ASSIGNED:${p.homeworkId}:${g.guardianId}`,
        guardianId: g.guardianId,
        homeworkId: p.homeworkId,
        createdById: p.createdById,
        sendAfter: now,
        createdAt: now,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async enqueueStudentAbsences(
    tx: Prisma.TransactionClient,
    p: {
      schoolId: string;
      sessionId: string;
      sessionDate: Date;
      createdById: string;
      students: { id: string; guardianId: string }[];
    },
  ): Promise<number> {
    const now = this.clock.now();
    const sendAfter = new Date(now.getTime() + this.config.absenceDelayMs);
    const day = p.sessionDate.toISOString().slice(0, 10);
    const data = p.students.map((s) => ({
      schoolId: p.schoolId,
      type: "STUDENT_ABSENT" as const,
      dedupeKey: `STUDENT_ABSENT:${s.id}:${day}`,
      guardianId: s.guardianId,
      studentId: s.id,
      sessionId: p.sessionId,
      createdById: p.createdById,
      sendAfter,
      createdAt: now,
    }));
    const created = await tx.notification.createMany({
      data,
      skipDuplicates: true,
    });

    let rearmed = 0;
    for (const row of data) {
      const result = await tx.notification.updateMany({
        where: { dedupeKey: row.dedupeKey, status: "CANCELLED" },
        data: {
          status: "PENDING",
          sessionId: row.sessionId,
          sendAfter,
          createdAt: now,
          attempts: 0,
          lockedAt: null,
          statusReason: null,
        },
      });
      rearmed += result.count;
    }
    return created.count + rearmed;
  }
}
