import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import type { StaffUser } from "../auth/auth-user.type.js";
import { PrismaService } from "../prisma.service.js";
import type { CommunicationLogQueryDto } from "./dtos/communication-log-query.dto.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const communicationLogSelect = {
  id: true,
  type: true,
  channel: true,
  status: true,
  attempts: true,
  createdAt: true,
  sentAt: true,
  student: {
    select: {
      id: true,
      fullName: true,
      fullNameEn: true,
    },
  },
  homework: {
    select: {
      title: true,
      assignment: {
        select: {
          class: {
            select: {
              name: true,
              nameEn: true,
            },
          },
          subject: {
            select: {
              name: true,
              nameEn: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.NotificationSelect;

type CommunicationLogRow = Prisma.NotificationGetPayload<{
  select: typeof communicationLogSelect;
}>;

@Injectable()
export class CommunicationLogService {
  constructor(private prisma: PrismaService) {}

  async getCommunicationLog(
    user: StaffUser,
    query: CommunicationLogQueryDto,
  ) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException("The from date must not be after the to date");
    }

    const where: Prisma.NotificationWhereInput = {
      schoolId: user.schoolId,
      ...(user.role === "TEACHER" ? { createdById: user.id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: communicationLogSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.mapCommunicationLogItem(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private mapCommunicationLogItem(row: CommunicationLogRow) {
    return {
      id: row.id,
      type: row.type,
      channel: row.channel,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      student: row.student
        ? {
            id: row.student.id,
            name: row.student.fullName,
            nameEn: row.student.fullNameEn,
          }
        : null,
      homework: row.homework
        ? {
            title: row.homework.title,
            className: row.homework.assignment.class.name,
            classNameEn: row.homework.assignment.class.nameEn,
            subjectName: row.homework.assignment.subject.name,
            subjectNameEn: row.homework.assignment.subject.nameEn,
          }
        : null,
      failureReason: row.status === "FAILED" ? "SEND_FAILED" : null,
    };
  }
}
