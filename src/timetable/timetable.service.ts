import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { TimetableStatus, Weekday } from "../generated/prisma/enums.js";
import type { GuardianUser, StaffUser } from "../auth/auth-user.type.js";
import { PrismaService } from "../prisma.service.js";

const SCHOOL_DAYS: Weekday[] = [
  Weekday.SUNDAY,
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
];
const ENTRY_INCLUDE = {
  period: { select: { id: true, number: true, startTime: true, endTime: true } },
  assignment: {
    select: {
      subject: { select: { name: true, nameEn: true } },
      class: { select: { id: true, name: true, nameEn: true, grade: true, gradeEn: true } },
      staff: { select: { id: true, fullName: true, fullNameEn: true } },
    },
  },
} satisfies Prisma.TimetableEntryInclude;

@Injectable()
export class TimetableService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSchoolAdmin(user: StaffUser) {
    if (user.role !== "SCHOOL_ADMIN") {
      throw new ForbiddenException({ code: "TIMETABLE_ADMIN_REQUIRED", message: "Only a school administrator can manage timetables" });
    }
  }

  async listAcademicYears(user: StaffUser) {
    this.assertSchoolAdmin(user);
    return this.prisma.academicYear.findMany({
      where: { schoolId: user.schoolId },
      select: { id: true, name: true, nameEn: true, isCurrent: true },
      orderBy: [{ isCurrent: "desc" }, { name: "desc" }],
    });
  }

  async listSchoolTimetables(user: StaffUser, academicYearId?: string) {
    this.assertSchoolAdmin(user);
    return this.prisma.timetable.findMany({
      where: { schoolId: user.schoolId, ...(academicYearId ? { academicYearId } : {}) },
      orderBy: [{ academicYearId: "asc" }, { version: "desc" }],
      include: {
        academicYear: { select: { id: true, name: true, nameEn: true, isCurrent: true } },
        _count: { select: { entries: true } },
      },
    });
  }

  async getTimetable(user: StaffUser, timetableId: string) {
    const timetable = await this.prisma.timetable.findFirst({
      where: { id: timetableId, schoolId: user.schoolId },
      include: {
        academicYear: { select: { id: true, name: true, nameEn: true } },
        entries: { where: { isActive: true }, include: ENTRY_INCLUDE, orderBy: [{ weekday: "asc" }, { period: { number: "asc" } }] },
      },
    });
    if (!timetable) throw new NotFoundException({ code: "TIMETABLE_NOT_FOUND", message: "Timetable not found" });
    if (user.role === "TEACHER") {
      return { ...timetable, entries: timetable.entries.filter((entry) => entry.staffId === user.id) };
    }
    if (user.role !== "SCHOOL_ADMIN") {
      throw new ForbiddenException({ code: "TIMETABLE_ACCESS_DENIED", message: "You cannot access school timetables" });
    }
    return timetable;
  }

  async generateDraft(user: StaffUser, academicYearId: string) {
    this.assertSchoolAdmin(user);
    const year = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, schoolId: user.schoolId },
      include: {
        classes: { select: { id: true, name: true, nameEn: true } },
      },
    });
    if (!year) throw new NotFoundException({ code: "ACADEMIC_YEAR_NOT_FOUND", message: "Academic year not found in your school" });

    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { schoolId: user.schoolId, isActive: true, class: { academicYearId } },
      include: { staff: { select: { id: true, fullName: true } }, class: { select: { id: true, name: true } }, subject: { select: { id: true, name: true } } },
      orderBy: [{ lessonsPerWeek: "desc" }, { classId: "asc" }],
    });
    const missingConfiguration = assignments.filter((item) => !Number.isInteger(item.lessonsPerWeek) || (item.lessonsPerWeek ?? 0) < 1);
    if (missingConfiguration.length) {
      throw new BadRequestException({
        code: "TIMETABLE_LESSON_COUNTS_MISSING",
        message: "Set a positive lessonsPerWeek value for every active teacher assignment before generating a timetable",
        assignmentIds: missingConfiguration.map((item) => item.id),
      });
    }
    if (!assignments.length) {
      throw new BadRequestException({ code: "TIMETABLE_NO_ASSIGNMENTS", message: "No active teacher assignments exist for this academic year" });
    }

    const periods = await this.prisma.period.findMany({ where: { schoolId: user.schoolId }, orderBy: { number: "asc" } });
    if (!periods.length) throw new BadRequestException({ code: "TIMETABLE_NO_PERIODS", message: "Create periods before generating a timetable" });

    const requestedLessons = assignments.reduce((total, item) => total + (item.lessonsPerWeek ?? 0), 0);
    const classCapacity = year.classes.length * periods.length * SCHOOL_DAYS.length;
    if (requestedLessons > classCapacity) {
      throw new ConflictException({
        code: "TIMETABLE_CAPACITY_EXCEEDED",
        message: "Requested lessons exceed total class timetable capacity",
        requestedLessons,
        availableClassSlots: classCapacity,
      });
    }

    const teacherSlots = new Set<string>();
    const classSlots = new Set<string>();
    const planned: Array<{ assignmentId: string; staffId: string; classId: string; periodId: string; weekday: Weekday }> = [];
    const missing: Array<{ assignmentId: string; classId: string; staffId: string; subject: string; requested: number; placed: number }> = [];

    for (const assignment of assignments) {
      let placed = 0;
      const requested = assignment.lessonsPerWeek ?? 0;
      for (const weekday of SCHOOL_DAYS) {
        for (const period of periods) {
          if (placed >= requested) break;
          const teacherKey = `${assignment.staffId}:${weekday}:${period.id}`;
          const classKey = `${assignment.classId}:${weekday}:${period.id}`;
          if (teacherSlots.has(teacherKey) || classSlots.has(classKey)) continue;
          teacherSlots.add(teacherKey);
          classSlots.add(classKey);
          planned.push({ assignmentId: assignment.id, staffId: assignment.staffId, classId: assignment.classId, periodId: period.id, weekday });
          placed++;
        }
        if (placed >= requested) break;
      }
      if (placed < requested) missing.push({ assignmentId: assignment.id, classId: assignment.classId, staffId: assignment.staffId, subject: assignment.subject.name, requested, placed });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.timetable.findFirst({
        where: { schoolId: user.schoolId, academicYearId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const timetable = await tx.timetable.create({
        data: { schoolId: user.schoolId, academicYearId, version: (latest?.version ?? 0) + 1, status: TimetableStatus.DRAFT, createdById: user.id },
      });
      if (planned.length) {
        await tx.timetableEntry.createMany({
          data: planned.map((entry) => ({ ...entry, timetableId: timetable.id, schoolId: user.schoolId })),
        });
      }
      await tx.timetableGenerationJob.create({
        data: {
          schoolId: user.schoolId,
          timetableId: timetable.id,
          requestedById: user.id,
          algorithmVersion: "greedy-v1",
          status: missing.length ? "SUCCEEDED" : "SUCCEEDED",
          resultSummary: { requestedLessons, placedLessons: planned.length, missingLessons: missing.reduce((sum, item) => sum + item.requested - item.placed, 0), missing },
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });
      return { timetable, requestedLessons, placedLessons: planned.length, missing };
    });
    return { ...result, publishable: result.missing.length === 0, message: result.missing.length ? "Draft created with unplaced lessons; resolve the listed shortages before publishing" : "Draft generated without teacher or class slot conflicts" };
  }

  async updateEntry(user: StaffUser, timetableId: string, entryId: string, periodId: string, weekday: Weekday) {
    this.assertSchoolAdmin(user);
    const timetable = await this.prisma.timetable.findFirst({ where: { id: timetableId, schoolId: user.schoolId } });
    if (!timetable) throw new NotFoundException({ code: "TIMETABLE_NOT_FOUND", message: "Timetable not found" });
    if (timetable.status !== TimetableStatus.DRAFT) throw new ConflictException({ code: "TIMETABLE_NOT_DRAFT", message: "Only draft timetables can be edited" });
    const entry = await this.prisma.timetableEntry.findFirst({ where: { id: entryId, timetableId, schoolId: user.schoolId, isActive: true } });
    if (!entry) throw new NotFoundException({ code: "TIMETABLE_ENTRY_NOT_FOUND", message: "Timetable entry not found" });
    const period = await this.prisma.period.findFirst({ where: { id: periodId, schoolId: user.schoolId } });
    if (!period) throw new NotFoundException({ code: "TIMETABLE_PERIOD_NOT_FOUND", message: "Period not found in this school" });

    const collisions = await this.prisma.timetableEntry.findMany({
      where: {
        timetableId, schoolId: user.schoolId, isActive: true, id: { not: entryId }, weekday, periodId,
        OR: [{ staffId: entry.staffId }, { classId: entry.classId }],
      },
      include: { assignment: { select: { staff: { select: { fullName: true } }, class: { select: { name: true } } } }, period: { select: { number: true } } },
    });
    if (collisions.length) {
      throw new ConflictException({
        code: "TIMETABLE_EDIT_CONFLICT",
        message: "This change conflicts with another lesson for the same teacher or class",
        conflicts: collisions.map((item) => ({ entryId: item.id, teacher: item.assignment.staff.fullName, className: item.assignment.class.name, period: item.period.number, weekday: item.weekday })),
      });
    }

    const attendanceSessions = await this.prisma.attendanceSession.count({ where: { timetableEntryId: entryId } });
    if (attendanceSessions) {
      throw new ConflictException({ code: "TIMETABLE_ENTRY_HAS_ATTENDANCE", message: "This lesson has attendance history and cannot be moved" });
    }
    const updated = await this.prisma.timetableEntry.update({ where: { id: entryId }, data: { periodId, weekday }, include: ENTRY_INCLUDE });
    return { entry: updated, conflictCheck: { hasConflicts: false, checkedTeacherAndClass: true } };
  }

  async deleteEntry(user: StaffUser, timetableId: string, entryId: string) {
    this.assertSchoolAdmin(user);
    const timetable = await this.prisma.timetable.findFirst({ where: { id: timetableId, schoolId: user.schoolId } });
    if (!timetable) throw new NotFoundException({ code: "TIMETABLE_NOT_FOUND", message: "Timetable not found" });
    if (timetable.status !== TimetableStatus.DRAFT) throw new ConflictException({ code: "TIMETABLE_NOT_DRAFT", message: "Only draft timetables can be edited" });
    const entry = await this.prisma.timetableEntry.findFirst({ where: { id: entryId, timetableId, schoolId: user.schoolId, isActive: true } });
    if (!entry) throw new NotFoundException({ code: "TIMETABLE_ENTRY_NOT_FOUND", message: "Timetable entry not found" });
    const sessions = await this.prisma.attendanceSession.count({ where: { timetableEntryId: entryId } });
    if (sessions) throw new ConflictException({ code: "TIMETABLE_ENTRY_HAS_ATTENDANCE", message: "This lesson has attendance history and cannot be deleted" });
    await this.prisma.timetableEntry.delete({ where: { id: entryId } });
    const remaining = await this.prisma.timetableEntry.count({ where: { timetableId, assignmentId: entry.assignmentId, isActive: true } });
    const assignment = await this.prisma.teacherAssignment.findUnique({ where: { id: entry.assignmentId }, select: { lessonsPerWeek: true } });
    return {
      deleted: true,
      entryId,
      assignment: {
        requiredLessons: assignment?.lessonsPerWeek ?? null,
        placedLessons: remaining,
        hasMissingLessons: assignment?.lessonsPerWeek != null && remaining < assignment.lessonsPerWeek,
      },
    };
  }

  async publish(user: StaffUser, timetableId: string) {
    this.assertSchoolAdmin(user);
    return this.prisma.$transaction(async (tx) => {
      const timetable = await tx.timetable.findFirst({
        where: { id: timetableId, schoolId: user.schoolId },
        include: { entries: { where: { isActive: true } } },
      });
      if (!timetable) throw new NotFoundException({ code: "TIMETABLE_NOT_FOUND", message: "Timetable not found" });
      if (timetable.status !== TimetableStatus.DRAFT) throw new ConflictException({ code: "TIMETABLE_NOT_DRAFT", message: "Only draft timetables can be published" });

      const assignments = await tx.teacherAssignment.findMany({ where: { schoolId: user.schoolId, isActive: true, class: { academicYearId: timetable.academicYearId } }, select: { id: true, lessonsPerWeek: true } });
      const counts = new Map<string, number>();
      for (const entry of timetable.entries) counts.set(entry.assignmentId, (counts.get(entry.assignmentId) ?? 0) + 1);
      const missing = assignments.filter((assignment) => assignment.lessonsPerWeek == null || (counts.get(assignment.id) ?? 0) < assignment.lessonsPerWeek);
      if (missing.length) {
        throw new ConflictException({ code: "TIMETABLE_INCOMPLETE", message: "Cannot publish: some assignments have missing lessons", assignments: missing.map((item) => ({ assignmentId: item.id, required: item.lessonsPerWeek, placed: counts.get(item.id) ?? 0 })) });
      }

      const entries = timetable.entries;
      const teacherSlots = new Set<string>();
      const classSlots = new Set<string>();
      const periods = await tx.period.findMany({ where: { schoolId: user.schoolId }, select: { id: true, number: true } });
      const periodNumber = new Map(periods.map((period) => [period.id, period.number]));
      for (const entry of entries) {
        const key = `${entry.weekday}:${periodNumber.get(entry.periodId)}`;
        const teacherKey = `${entry.staffId}:${key}`;
        const classKey = `${entry.classId}:${key}`;
        if (teacherSlots.has(teacherKey) || classSlots.has(classKey)) {
          throw new ConflictException({ code: "TIMETABLE_CONFLICTS_EXIST", message: "Cannot publish a timetable with teacher or class conflicts" });
        }
        teacherSlots.add(teacherKey);
        classSlots.add(classKey);
      }
      await tx.timetable.updateMany({ where: { schoolId: user.schoolId, academicYearId: timetable.academicYearId, status: TimetableStatus.PUBLISHED }, data: { status: TimetableStatus.ARCHIVED } });
      return tx.timetable.update({ where: { id: timetable.id }, data: { status: TimetableStatus.PUBLISHED, approvedById: user.id, approvedAt: new Date(), publishedAt: new Date() } });
    });
  }

  async deleteDraft(user: StaffUser, timetableId: string) {
    this.assertSchoolAdmin(user);
    const timetable = await this.prisma.timetable.findFirst({ where: { id: timetableId, schoolId: user.schoolId } });
    if (!timetable) throw new NotFoundException({ code: "TIMETABLE_NOT_FOUND", message: "Timetable not found" });
    if (timetable.status !== TimetableStatus.DRAFT) throw new ConflictException({ code: "TIMETABLE_NOT_DRAFT", message: "Only draft timetables can be deleted" });
    const entryIds = await this.prisma.timetableEntry.findMany({ where: { timetableId }, select: { id: true } });
    const sessions = await this.prisma.attendanceSession.count({ where: { timetableEntryId: { in: entryIds.map((item) => item.id) } } });
    if (sessions) throw new ConflictException({ code: "TIMETABLE_HAS_ATTENDANCE", message: "Cannot delete a timetable with attendance history" });
    await this.prisma.$transaction(async (tx) => {
      await tx.timetableEntry.deleteMany({ where: { timetableId, schoolId: user.schoolId } });
      await tx.timetableGenerationJob.deleteMany({ where: { timetableId, schoolId: user.schoolId } });
      await tx.timetable.delete({ where: { id: timetableId } });
    });
    return { deleted: true, timetableId };
  }

  async getTeacherTimetable(user: StaffUser, academicYearId?: string) {
    if (user.role !== "TEACHER") throw new ForbiddenException({ code: "TEACHER_ONLY", message: "Teacher account required" });
    return this.prisma.timetableEntry.findMany({
      where: { schoolId: user.schoolId, staffId: user.id, isActive: true, timetable: { status: { in: [TimetableStatus.DRAFT, TimetableStatus.PUBLISHED] }, ...(academicYearId ? { academicYearId } : {}) } },
      include: { timetable: { select: { id: true, version: true, status: true, academicYearId: true } }, ...ENTRY_INCLUDE },
      orderBy: [{ weekday: "asc" }, { period: { number: "asc" } }],
    });
  }

  async getGuardianStudentTimetable(user: GuardianUser, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, guardianId: user.id, isActive: true },
      select: { id: true, schoolId: true, classId: true, fullName: true, fullNameEn: true, class: { select: { name: true, nameEn: true, academicYearId: true } } },
    });
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found for this guardian" });
    const timetable = await this.prisma.timetable.findFirst({
      where: { schoolId: student.schoolId, academicYearId: student.class.academicYearId, status: TimetableStatus.PUBLISHED },
      orderBy: { version: "desc" },
      include: { entries: { where: { classId: student.classId, isActive: true }, include: ENTRY_INCLUDE, orderBy: [{ weekday: "asc" }, { period: { number: "asc" } }] } },
    });
    return { student: { id: student.id, fullName: student.fullName, fullNameEn: student.fullNameEn, class: student.class }, timetable: timetable ? { id: timetable.id, version: timetable.version, status: timetable.status, entries: timetable.entries } : null };
  }
}
