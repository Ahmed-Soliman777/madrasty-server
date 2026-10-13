import { Injectable } from "@nestjs/common";
import { ClockService } from "../common/clock.service.js";
import type { Prisma } from "../generated/prisma/client.js";

@Injectable()
export class NotificationsService {
  constructor(private clock: ClockService) {}

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
}
