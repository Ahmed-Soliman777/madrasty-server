import { HttpStatus, Injectable } from "@nestjs/common";
import { ClockService } from "../common/clock.service.js";
import { apiError } from "../common/api-error.js";
import { schoolNow } from "../common/school-time.js";
import type { StaffUser } from "../auth/auth-user.type.js";
import { Prisma } from "../generated/prisma/client.js";
import type { AttendanceStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma.service.js";
import { AttendanceErrorCode as Code } from "./attendance.errors.js";

export interface RecordInput {
  studentId: string;
  status: AttendanceStatus;
  arrivedAt?: string;
}

const sessionView = (s: {
  id: string;
  timetableEntryId: string;
  date: Date;
  status: string;
  submittedAt: Date | null;
}) => ({
  id: s.id,
  timetableEntryId: s.timetableEntryId,
  date: s.date.toISOString().slice(0, 10),
  status: s.status,
  submittedAt: s.submittedAt,
});

interface RecordRow {
  studentId: string;
  status: string;
  arrivedAt: Date | null;
  isExcused: boolean;
  markedAt: Date;
}

const recordView = (r: RecordRow) => ({
  studentId: r.studentId,
  status: r.status,
  arrivedAt: r.arrivedAt,
  isExcused: r.isExcused,
  markedAt: r.markedAt,
});

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async openSession(user: StaffUser, timetableEntryId: string) {
    const entry = await this.prisma.timetableEntry.findFirst({
      where: {
        id: timetableEntryId,
        schoolId: user.schoolId,
        isActive: true,
        assignment: {
          isActive: true,
          class: { academicYear: { isCurrent: true } },
        },
      },
      select: { weekday: true, staffId: true },
    });
    if (!entry) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        Code.EntryNotFound,
        "Lesson not found",
      );
    }
    if (entry.staffId !== user.id) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        Code.NotAssigned,
        "This lesson is assigned to another teacher",
      );
    }

    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: user.schoolId },
      select: { timezone: true },
    });
    const today = schoolNow(school.timezone, this.clock.now());
    if (entry.weekday !== today.weekday) {
      throw apiError(
        HttpStatus.CONFLICT,
        Code.WrongDay,
        "This lesson is not scheduled for today",
      );
    }

    const key = {
      timetableEntryId_date: { timetableEntryId, date: today.date },
    };
    const existing = await this.prisma.attendanceSession.findUnique({
      where: key,
    });
    if (existing) return sessionView(existing);
    try {
      const created = await this.prisma.attendanceSession.create({
        data: {
          schoolId: user.schoolId,
          timetableEntryId,
          date: today.date,
          takenById: user.id,
        },
      });
      return sessionView(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return sessionView(
          await this.prisma.attendanceSession.findUniqueOrThrow({ where: key }),
        );
      }
      throw error;
    }
  }

  async setRecords(user: StaffUser, sessionId: string, items: RecordInput[]) {
    const ids = items.map((i) => i.studentId);
    if (new Set(ids).size !== ids.length) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        Code.DuplicateStudent,
        "Duplicate students in request",
      );
    }
    const now = this.clock.now();
    for (const item of items) {
      if (item.arrivedAt && item.status === "ABSENT") {
        throw apiError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          Code.InvalidArrival,
          "An absent student cannot have an arrival time",
          { studentId: item.studentId },
        );
      }
      if (
        item.arrivedAt &&
        new Date(item.arrivedAt).getTime() > now.getTime() + 2 * 60_000
      ) {
        throw apiError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          Code.InvalidArrival,
          "Arrival time cannot be in the future",
          { studentId: item.studentId },
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockOpenSession(tx, user, sessionId);

      const valid = await tx.student.findMany({
        where: {
          id: { in: ids },
          schoolId: user.schoolId,
          classId: session.classId,
          isActive: true,
        },
        select: { id: true },
      });
      if (valid.length !== ids.length) {
        const ok = new Set(valid.map((s) => s.id));
        throw apiError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          Code.StudentNotInClass,
          "Some students are not in this class",
          {
            studentIds: ids.filter((id) => !ok.has(id)),
          },
        );
      }

      const existing = new Map(
        (
          await tx.attendanceRecord.findMany({
            where: { sessionId, studentId: { in: ids } },
          })
        ).map((r) => [r.studentId, r]),
      );
      const out: RecordRow[] = [];
      for (const item of items) {
        const prev = existing.get(item.studentId);
        const provided = item.arrivedAt ? new Date(item.arrivedAt) : null;
        const arrivedAt =
          item.status === "ABSENT"
            ? null
            : item.status === "LATE"
              ? (provided ??
                (prev?.status === "LATE" && prev.arrivedAt
                  ? prev.arrivedAt
                  : now))
              : provided;

        if (
          prev &&
          prev.status === item.status &&
          prev.arrivedAt?.getTime() === arrivedAt?.getTime()
        ) {
          out.push(prev);
          continue;
        }
        const statusChanged = !prev || prev.status !== item.status;
        out.push(
          await tx.attendanceRecord.upsert({
            where: {
              sessionId_studentId: { sessionId, studentId: item.studentId },
            },
            create: {
              schoolId: user.schoolId,
              sessionId,
              studentId: item.studentId,
              status: item.status,
              arrivedAt,
              markedById: user.id,
              markedAt: now,
            },
            update: {
              status: item.status,
              arrivedAt,
              markedById: user.id,
              markedAt: now,
              ...(statusChanged ? { isExcused: false, excuseNote: null } : {}),
            },
          }),
        );
      }
      return { records: out.map(recordView) };
    });
  }

  async submit(user: StaffUser, sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, user, sessionId);
      const [students, records] = [
        await tx.student.findMany({
          where: {
            schoolId: user.schoolId,
            classId: session.classId,
            isActive: true,
          },
          select: { id: true },
        }),
        await tx.attendanceRecord.findMany({
          where: { sessionId },
          select: { studentId: true, status: true },
        }),
      ];
      const count = (s: string) => records.filter((r) => r.status === s).length;
      const summary = {
        total: students.length,
        present: count("PRESENT"),
        late: count("LATE"),
        absent: count("ABSENT"),
      };

      if (session.status === "SUBMITTED")
        return { session: sessionView(session), summary };

      const marked = new Set(records.map((r) => r.studentId));
      const unmarked = students
        .filter((s) => !marked.has(s.id))
        .map((s) => s.id);
      if (unmarked.length > 0) {
        throw apiError(
          HttpStatus.CONFLICT,
          Code.Incomplete,
          "Some students have no attendance status",
          {
            unmarkedCount: unmarked.length,
            unmarkedStudentIds: unmarked,
          },
        );
      }
      const submitted = await tx.attendanceSession.update({
        where: { id: sessionId },
        data: { status: "SUBMITTED", submittedAt: this.clock.now() },
      });
      return { session: sessionView(submitted), summary };
    });
  }

  // ───────── helpers ─────────

  private async lockSession(
    tx: Prisma.TransactionClient,
    user: StaffUser,
    sessionId: string,
  ) {
    const found = await tx.attendanceSession.findFirst({
      where: { id: sessionId, schoolId: user.schoolId },
      select: { timetableEntry: { select: { staffId: true } } },
    });
    if (!found) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        Code.SessionNotFound,
        "Attendance session not found",
      );
    }
    if (found.timetableEntry.staffId !== user.id) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        Code.NotAssigned,
        "This lesson is assigned to another teacher",
      );
    }
    await tx.$queryRaw`SELECT 1 FROM "attendance_sessions" WHERE "id" = ${sessionId} FOR UPDATE`;
    const session = await tx.attendanceSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        id: true,
        timetableEntryId: true,
        date: true,
        status: true,
        submittedAt: true,
        timetableEntry: { select: { classId: true } },
      },
    });
    return { ...session, classId: session.timetableEntry.classId };
  }

  private async lockOpenSession(
    tx: Prisma.TransactionClient,
    user: StaffUser,
    sessionId: string,
  ) {
    const session = await this.lockSession(tx, user, sessionId);
    if (session.status !== "OPEN") {
      throw apiError(
        HttpStatus.CONFLICT,
        Code.SessionLocked,
        "This attendance session is already submitted",
      );
    }
    return session;
  }
}
