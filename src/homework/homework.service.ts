import { HttpStatus, Injectable } from "@nestjs/common";
import { apiError } from "../common/api-error.js";
import { ClockService } from "../common/clock.service.js";
import type { StaffUser } from "../auth/auth-user.type.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma.service.js";
import type {
  CreateHomeworkDto,
  ListHomeworkQueryDto,
  UpdateHomeworkDto,
} from "./dtos/homework.dto.js";
import { HomeworkErrorCode as Code } from "./homework.errors.js";

const MAX_DUE_DAYS = 365;
const DEFAULT_LIMIT = 20;

const classSelect = {
  id: true,
  name: true,
  nameEn: true,
  grade: true,
  gradeEn: true,
} as const;
const subjectSelect = { id: true, name: true, nameEn: true } as const;
const homeworkSelect = {
  id: true,
  assignmentId: true,
  staffId: true,
  title: true,
  notes: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  assignment: {
    select: {
      class: { select: classSelect },
      subject: { select: subjectSelect },
    },
  },
} satisfies Prisma.HomeworkSelect;
type HomeworkRow = Prisma.HomeworkGetPayload<{ select: typeof homeworkSelect }>;

const view = (h: HomeworkRow) => ({
  id: h.id,
  assignmentId: h.assignmentId,
  class: h.assignment.class,
  subject: h.assignment.subject,
  title: h.title,
  notes: h.notes,
  dueAt: h.dueAt,
  createdAt: h.createdAt,
  updatedAt: h.updatedAt,
});

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const normalizeNotes = (notes?: string | null) => notes?.trim() || null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class HomeworkService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async myAssignments(user: StaffUser) {
    const rows = await this.prisma.teacherAssignment.findMany({
      where: {
        schoolId: user.schoolId,
        staffId: user.id,
        isActive: true,
        class: { academicYear: { isCurrent: true } },
      },
      select: {
        id: true,
        class: { select: classSelect },
        subject: { select: subjectSelect },
      },
      orderBy: [{ class: { nameEn: "asc" } }, { subject: { nameEn: "asc" } }],
    });
    return {
      assignments: rows.map((r) => ({
        assignmentId: r.id,
        class: r.class,
        subject: r.subject,
      })),
    };
  }

  async create(user: StaffUser, dto: CreateHomeworkDto) {
    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: {
        id: dto.assignmentId,
        schoolId: user.schoolId,
        isActive: true,
        class: { academicYear: { isCurrent: true } },
      },
      select: { staffId: true, classId: true },
    });
    if (!assignment) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        Code.AssignmentNotFound,
        "Class/subject assignment not found",
      );
    }
    if (assignment.staffId !== user.id) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        Code.NotAssigned,
        "This class/subject is assigned to another teacher",
      );
    }

    const now = this.clock.now();
    const dueAt = this.validDueAt(dto.dueAt, now);
    const duplicateWhere = {
      assignmentId: dto.assignmentId,
      title: dto.title,
      dueAt,
      deletedAt: null,
    };

    const existing = await this.prisma.homework.findFirst({
      where: duplicateWhere,
      select: homeworkSelect,
    });
    if (existing) return { homework: view(existing), created: false };
    try {
      const created = await this.prisma.homework.create({
        data: {
          schoolId: user.schoolId,
          assignmentId: dto.assignmentId,
          staffId: assignment.staffId,
          classId: assignment.classId,
          title: dto.title,
          notes: normalizeNotes(dto.notes),
          dueAt,
          createdAt: now,
        },
        select: homeworkSelect,
      });
      return { homework: view(created), created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.homework.findFirst({
          where: duplicateWhere,
          select: homeworkSelect,
        });
        if (winner) return { homework: view(winner), created: false };
      }
      throw error;
    }
  }

  async list(user: StaffUser, query: ListHomeworkQueryDto) {
    const now = this.clock.now();
    const order = query.order ?? "desc";
    const limit = query.limit ?? DEFAULT_LIMIT;
    const op = order === "desc" ? "lt" : "gt";
    const and: Prisma.HomeworkWhereInput[] = [];
    if (query.status === "upcoming") and.push({ dueAt: { gte: now } });
    if (query.status === "past") and.push({ dueAt: { lt: now } });
    if (query.cursor) {
      const c = this.decodeCursor(query.cursor);
      and.push({
        OR: [
          { dueAt: { [op]: c.dueAt } },
          { dueAt: c.dueAt, id: { [op]: c.id } },
        ],
      });
    }

    const rows = await this.prisma.homework.findMany({
      where: {
        schoolId: user.schoolId,
        staffId: user.id,
        deletedAt: null,
        ...(query.assignmentId ? { assignmentId: query.assignmentId } : {}),
        AND: and,
      },
      select: homeworkSelect,
      orderBy: [{ dueAt: order }, { id: order }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(view),
      nextCursor:
        rows.length > limit && last
          ? this.encodeCursor(last.dueAt, last.id)
          : null,
    };
  }

  async get(user: StaffUser, id: string) {
    const homework = await this.loadOwned(user, id);
    return { homework: view(homework) };
  }

  async update(user: StaffUser, id: string, dto: UpdateHomeworkDto) {
    await this.loadOwned(user, id);
    if (
      dto.title === undefined &&
      dto.notes === undefined &&
      dto.dueAt === undefined
    ) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        Code.EmptyUpdate,
        "Nothing to update",
      );
    }
    const data: Prisma.HomeworkUpdateManyMutationInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.notes !== undefined) data.notes = normalizeNotes(dto.notes);
    if (dto.dueAt !== undefined)
      data.dueAt = this.validDueAt(dto.dueAt, this.clock.now());

    try {
      const result = await this.prisma.homework.updateMany({
        where: { id, schoolId: user.schoolId, deletedAt: null },
        data,
      });
      if (result.count === 0) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          Code.NotFound,
          "Homework not found",
        );
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw apiError(
          HttpStatus.CONFLICT,
          Code.Duplicate,
          "Identical homework already exists for this class and due date",
        );
      }
      throw error;
    }
    return this.get(user, id);
  }

  async remove(user: StaffUser, id: string) {
    const found = await this.prisma.homework.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { staffId: true, deletedAt: true },
    });
    if (!found)
      throw apiError(HttpStatus.NOT_FOUND, Code.NotFound, "Homework not found");
    if (user.role === "TEACHER" && found.staffId !== user.id) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        Code.Forbidden,
        "Only the teacher who assigned this homework can change it",
      );
    }
    if (!found.deletedAt) {
      await this.prisma.homework.updateMany({
        where: { id, schoolId: user.schoolId, deletedAt: null },
        data: { deletedAt: this.clock.now() },
      });
    }
    const after = await this.prisma.homework.findUniqueOrThrow({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    return { id: after.id, deletedAt: after.deletedAt };
  }

  // ───────── helpers ─────────

  private async loadOwned(user: StaffUser, id: string) {
    const homework = await this.prisma.homework.findFirst({
      where: { id, schoolId: user.schoolId },
      select: homeworkSelect,
    });
    if (!homework)
      throw apiError(HttpStatus.NOT_FOUND, Code.NotFound, "Homework not found");
    if (homework.staffId !== user.id) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        Code.Forbidden,
        "Only the teacher who assigned this homework can access it",
      );
    }
    if (homework.deletedAt)
      throw apiError(HttpStatus.NOT_FOUND, Code.NotFound, "Homework not found");
    return homework;
  }

  private validDueAt(value: string, now: Date) {
    const dueAt = new Date(value);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= now.getTime()) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        Code.DueInPast,
        "The due date must be in the future",
      );
    }
    if (dueAt.getTime() > now.getTime() + MAX_DUE_DAYS * 86_400_000) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        Code.DueTooFar,
        `The due date cannot be more than ${MAX_DUE_DAYS} days ahead`,
      );
    }
    return dueAt;
  }

  private encodeCursor(dueAt: Date, id: string) {
    return Buffer.from(JSON.stringify([dueAt.toISOString(), id])).toString(
      "base64url",
    );
  }

  private decodeCursor(cursor: string) {
    try {
      const [iso, id] = JSON.parse(
        Buffer.from(cursor, "base64url").toString(),
      ) as [string, string];
      const dueAt = new Date(iso);
      if (
        typeof iso === "string" &&
        !Number.isNaN(dueAt.getTime()) &&
        UUID.test(id)
      )
        return { dueAt, id };
    } catch {}
    throw apiError(
      HttpStatus.BAD_REQUEST,
      Code.InvalidCursor,
      "Invalid cursor",
    );
  }
}
