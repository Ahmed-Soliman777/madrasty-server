import { HttpStatus, Injectable } from "@nestjs/common";
import { apiError } from "../common/api-error.js";
import { ClockService } from "../common/clock.service.js";
import { lessonState, schoolNow } from "../common/school-time.js";
import type { StaffUser } from "../auth/auth-user.type.js";
import { BehaviorService } from "../behavior/behavior.service.js";
import { PrismaService } from "../prisma.service.js";

@Injectable()
export class TeacherPortalService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private behavior: BehaviorService,
  ) {}

  async getQuickPortal(user: StaffUser, requestedEntryId?: string) {
    const staff = await this.prisma.staff.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        fullName: true,
        fullNameEn: true,
        school: { select: { timezone: true } },
      },
    });
    const now = schoolNow(staff.school.timezone, this.clock.now());

    const entries = await this.prisma.timetableEntry.findMany({
      where: {
        schoolId: user.schoolId,
        staffId: user.id,
        weekday: now.weekday,
        isActive: true,
        assignment: {
          isActive: true,
          class: { academicYear: { isCurrent: true } },
        },
      },
      select: {
        id: true,
        assignmentId: true,
        period: { select: { number: true, startTime: true, endTime: true } },
        assignment: {
          select: {
            class: {
              select: {
                id: true,
                name: true,
                nameEn: true,
                grade: true,
                gradeEn: true,
                academicYear: { select: { startsOn: true } },
              },
            },
            subject: { select: { id: true, name: true, nameEn: true } },
          },
        },
      },
    });
    const lessons = entries
      .sort((a, b) => a.period.number - b.period.number)
      .map((e) => ({
        timetableEntryId: e.id,
        assignmentId: e.assignmentId,
        state: lessonState(e.period, now.time),
        period: e.period,
        class: {
          id: e.assignment.class.id,
          name: e.assignment.class.name,
          nameEn: e.assignment.class.nameEn,
          grade: e.assignment.class.grade,
          gradeEn: e.assignment.class.gradeEn,
        },
        subject: e.assignment.subject,
        yearStartsOn: e.assignment.class.academicYear.startsOn,
      }));

    const focus = requestedEntryId
      ? lessons.find((l) => l.timetableEntryId === requestedEntryId)
      : (lessons.find((l) => l.state === "CURRENT") ??
        lessons.find((l) => l.state === "UPCOMING") ??
        lessons[lessons.length - 1]);
    if (requestedEntryId && !focus) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "PORTAL_LESSON_NOT_FOUND",
        "Lesson not found among today's lessons",
      );
    }

    const behaviorCategories = await this.prisma.behaviorCategory.findMany({
      where: { schoolId: user.schoolId, isActive: true },
      select: {
        id: true,
        code: true,
        kind: true,
        points: true,
        name: true,
        nameEn: true,
      },
      orderBy: [{ kind: "asc" }, { code: "asc" }],
    });

    const base = {
      teacher: {
        id: staff.id,
        fullName: staff.fullName,
        fullNameEn: staff.fullNameEn,
      },
      now: {
        date: now.dateStr,
        weekday: now.weekday,
        time: now.time,
        timezone: staff.school.timezone,
      },
      lessons: lessons.map((l) => ({
        timetableEntryId: l.timetableEntryId,
        assignmentId: l.assignmentId,
        state: l.state,
        period: l.period,
        class: l.class,
        subject: l.subject,
      })),
      behaviorCategories,
    };
    if (!focus) {
      return {
        ...base,
        focusLessonId: null,
        session: null,
        roster: [],
        summary: { total: 0, present: 0, late: 0, absent: 0, unmarked: 0 },
      };
    }

    const [students, session] = await Promise.all([
      this.prisma.student.findMany({
        where: {
          schoolId: user.schoolId,
          classId: focus.class.id,
          isActive: true,
        },
        select: { id: true, fullName: true, fullNameEn: true },
        orderBy: { fullName: "asc" },
      }),
      this.prisma.attendanceSession.findUnique({
        where: {
          timetableEntryId_date: {
            timetableEntryId: focus.timetableEntryId,
            date: now.date,
          },
        },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          records: {
            select: {
              studentId: true,
              status: true,
              arrivedAt: true,
              isExcused: true,
            },
          },
        },
      }),
    ]);
    const studentIds = students.map((s) => s.id);
    const points = await this.behavior.totalPoints(
      studentIds,
      user.schoolId,
      focus.yearStartsOn,
    );
    const records = new Map(
      (session?.records ?? []).map((r) => [r.studentId, r]),
    );

    const roster = students.map((s) => {
      const r = records.get(s.id);
      return {
        studentId: s.id,
        fullName: s.fullName,
        fullNameEn: s.fullNameEn,
        attendance: r
          ? { status: r.status, arrivedAt: r.arrivedAt, isExcused: r.isExcused }
          : null,
        points: points.get(s.id) ?? 0,
      };
    });
    const count = (st: string) =>
      roster.filter((r) => r.attendance?.status === st).length;
    const marked = roster.filter((r) => r.attendance).length;

    return {
      ...base,
      focusLessonId: focus.timetableEntryId,
      session: session
        ? {
            id: session.id,
            status: session.status,
            submittedAt: session.submittedAt,
          }
        : null,
      roster,
      summary: {
        total: roster.length,
        present: count("PRESENT"),
        late: count("LATE"),
        absent: count("ABSENT"),
        unmarked: roster.length - marked,
      },
    };
  }
}
