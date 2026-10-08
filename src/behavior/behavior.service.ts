import { HttpStatus, Injectable } from "@nestjs/common";
import { apiError } from "../common/api-error.js";
import { ClockService } from "../common/clock.service.js";
import type { StaffUser } from "../auth/auth-user.type.js";
import { PrismaService } from "../prisma.service.js";
import { BehaviorErrorCode as Code } from "./behavior.errors.js";
import type { CreateBehaviorRecordDto } from "./dtos/behavior.dto.js";

export const VOID_WINDOW_MINUTES = 10;

interface RecordRow {
  id: string;
  studentId: string;
  categoryId: string;
  sessionId: string | null;
  points: number;
  createdAt: Date;
  voidedAt: Date | null;
  voidedById: string | null;
}

const recordView = (r: RecordRow) => ({
  id: r.id,
  studentId: r.studentId,
  categoryId: r.categoryId,
  sessionId: r.sessionId,
  points: r.points,
  createdAt: r.createdAt,
  voidedAt: r.voidedAt,
  voidedById: r.voidedById,
});

@Injectable()
export class BehaviorService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async totalPoints(studentIds: string[], schoolId: string, since: Date) {
    const rows = await this.prisma.behaviorRecord.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        schoolId,
        voidedAt: null,
        createdAt: { gte: since },
      },
      _sum: { points: true },
    });
    return new Map(rows.map((r) => [r.studentId, r._sum.points ?? 0]));
  }

  async create(user: StaffUser, dto: CreateBehaviorRecordDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, schoolId: user.schoolId, isActive: true },
      select: {
        id: true,
        classId: true,
        class: { select: { academicYear: { select: { startsOn: true } } } },
      },
    });
    if (!student) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        Code.StudentNotFound,
        "Student not found",
      );
    }

    const assigned = await this.prisma.teacherAssignment.findFirst({
      where: {
        schoolId: user.schoolId,
        staffId: user.id,
        classId: student.classId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!assigned) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        Code.NotAssigned,
        "You do not teach this student's class",
      );
    }

    const category = await this.prisma.behaviorCategory.findFirst({
      where: { id: dto.categoryId, schoolId: user.schoolId, isActive: true },
      select: { id: true, points: true },
    });
    if (!category) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        Code.CategoryNotFound,
        "Behavior category not found",
      );
    }

    if (dto.sessionId) {
      const session = await this.prisma.attendanceSession.findFirst({
        where: { id: dto.sessionId, schoolId: user.schoolId },
        select: {
          timetableEntry: { select: { staffId: true, classId: true } },
        },
      });
      if (!session) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          Code.SessionNotFound,
          "Attendance session not found",
        );
      }
      if (session.timetableEntry.staffId !== user.id) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          Code.NotAssigned,
          "This lesson is assigned to another teacher",
        );
      }
      if (session.timetableEntry.classId !== student.classId) {
        throw apiError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          Code.SessionMismatch,
          "The student is not in this lesson's class",
        );
      }
    }

    const record = await this.prisma.behaviorRecord.create({
      data: {
        schoolId: user.schoolId,
        studentId: student.id,
        categoryId: category.id,
        teacherId: user.id,
        sessionId: dto.sessionId ?? null,
        points: category.points,
        createdAt: this.clock.now(),
      },
    });
    return {
      record: recordView(record),
      studentPoints: await this.studentPoints(student.id, user.schoolId),
    };
  }

  async void(user: StaffUser, recordId: string) {
    const record = await this.prisma.behaviorRecord.findFirst({
      where: { id: recordId, schoolId: user.schoolId },
    });
    if (!record) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        Code.RecordNotFound,
        "Behavior record not found",
      );
    }
    if (record.voidedAt) return this.voidResult(record);

    const now = this.clock.now();
    if (user.role === "TEACHER") {
      if (record.teacherId !== user.id) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          Code.VoidForbidden,
          "Only the teacher who recorded this can undo it",
        );
      }
      if (
        now.getTime() - record.createdAt.getTime() >
        VOID_WINDOW_MINUTES * 60_000
      ) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          Code.VoidWindowExpired,
          "The undo window has expired; ask the school administration",
          { windowMinutes: VOID_WINDOW_MINUTES },
        );
      }
    }

    await this.prisma.behaviorRecord.updateMany({
      where: { id: recordId, schoolId: user.schoolId, voidedAt: null },
      data: { voidedAt: now, voidedById: user.id },
    });
    return this.voidResult(
      await this.prisma.behaviorRecord.findUniqueOrThrow({
        where: { id: recordId },
      }),
    );
  }

  private async voidResult(record: RecordRow & { schoolId: string }) {
    return {
      record: recordView(record),
      studentPoints: await this.studentPoints(
        record.studentId,
        record.schoolId,
      ),
    };
  }

  private async studentPoints(studentId: string, schoolId: string) {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: {
        class: { select: { academicYear: { select: { startsOn: true } } } },
      },
    });
    const totals = await this.totalPoints(
      [studentId],
      schoolId,
      student.class.academicYear.startsOn,
    );
    return totals.get(studentId) ?? 0;
  }
}
