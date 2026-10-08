import "dotenv/config";
import bcrypt from "bcrypt";
import {
  BehaviorKind,
  Gender,
  Role,
  Weekday,
} from "../src/generated/prisma/enums.js";
import { PrismaService } from "../src/prisma.service.js";

const prismaService = new PrismaService();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const PERIODS = [
  { number: 1, startTime: "08:00", endTime: "08:45" },
  { number: 2, startTime: "09:00", endTime: "09:45" },
  { number: 3, startTime: "10:00", endTime: "10:45" },
  { number: 4, startTime: "11:00", endTime: "11:45" },
  { number: 5, startTime: "12:00", endTime: "12:45" },
  { number: 6, startTime: "13:00", endTime: "13:45" },
];
const SCHOOL_WEEK = [
  Weekday.SUNDAY,
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
];
const BEHAVIOR_CATEGORIES = [
  {
    code: "PARTICIPATION",
    kind: BehaviorKind.POSITIVE,
    points: 5,
    name: "مشاركة متميزة",
    nameEn: "Great participation",
  },
  {
    code: "HOMEWORK",
    kind: BehaviorKind.POSITIVE,
    points: 5,
    name: "إنجاز الواجب",
    nameEn: "Homework done",
  },
  {
    code: "DISTRACTION",
    kind: BehaviorKind.NEGATIVE,
    points: -3,
    name: "تشتت",
    nameEn: "Distracted",
  },
];

function requiredGender(name: string): Gender {
  const value = requiredEnv(name);
  if (value !== Gender.FEMALE && value !== Gender.MALE) {
    throw new Error(`${name} must be either FEMALE or MALE`);
  }
  return value;
}

async function seed() {
  try {
    const schoolNameAr = requiredEnv("SEED_SCHOOL_NAME_AR");
    const schoolNameEn = requiredEnv("SEED_SCHOOL_NAME_EN");
    const schoolCode = requiredEnv("SEED_SCHOOL_CODE");
    const teacherEmail = requiredEnv("SEED_TEACHER_EMAIL");
    const teacherPassword = await bcrypt.hash(
      requiredEnv("SEED_TEACHER_PASSWORD"),
      10,
    );
    const teacherNameAr = requiredEnv("SEED_TEACHER_NAME_AR");
    const teacherNameEn = requiredEnv("SEED_TEACHER_NAME_EN");
    const adminEmail = requiredEnv("SEED_ADMIN_EMAIL");
    const adminPassword = await bcrypt.hash(
      requiredEnv("SEED_ADMIN_PASSWORD"),
      10,
    );
    const adminNameAr = requiredEnv("SEED_ADMIN_NAME_AR");
    const adminNameEn = requiredEnv("SEED_ADMIN_NAME_EN");
    const guardianPhone = requiredEnv("SEED_GUARDIAN_PHONE");
    const guardianNationalId = requiredEnv("SEED_GUARDIAN_NATIONAL_ID");
    const guardianNameAr = requiredEnv("SEED_GUARDIAN_NAME_AR");
    const guardianNameEn = requiredEnv("SEED_GUARDIAN_NAME_EN");
    const student1NationalId = requiredEnv("SEED_STUDENT_1_NATIONAL_ID");
    const student1NameAr = requiredEnv("SEED_STUDENT_1_NAME_AR");
    const student1NameEn = requiredEnv("SEED_STUDENT_1_NAME_EN");
    const student1Gender = requiredGender("SEED_STUDENT_1_GENDER");
    const student2NationalId = requiredEnv("SEED_STUDENT_2_NATIONAL_ID");
    const student2NameAr = requiredEnv("SEED_STUDENT_2_NAME_AR");
    const student2NameEn = requiredEnv("SEED_STUDENT_2_NAME_EN");
    const student2Gender = requiredGender("SEED_STUDENT_2_GENDER");
    const class1NameAr = requiredEnv("SEED_CLASS_1_NAME_AR");
    const class1NameEn = requiredEnv("SEED_CLASS_1_NAME_EN");
    const class1GradeAr = requiredEnv("SEED_CLASS_1_GRADE_AR");
    const class1GradeEn = requiredEnv("SEED_CLASS_1_GRADE_EN");
    const class2NameAr = requiredEnv("SEED_CLASS_2_NAME_AR");
    const class2NameEn = requiredEnv("SEED_CLASS_2_NAME_EN");
    const class2GradeAr = requiredEnv("SEED_CLASS_2_GRADE_AR");
    const class2GradeEn = requiredEnv("SEED_CLASS_2_GRADE_EN");
    const otpCode = requiredEnv("SEED_TEST_OTP_CODE");

    const schoolAddressAr = process.env.SEED_SCHOOL_ADDRESS_AR?.trim() || null;
    const schoolAddressEn = process.env.SEED_SCHOOL_ADDRESS_EN?.trim() || null;

    await prismaService.$transaction(async (transaction) => {
      await transaction.otpVerification.deleteMany();
      await transaction.behaviorRecord.deleteMany();
      await transaction.attendanceRecord.deleteMany();
      await transaction.attendanceSession.deleteMany();
      await transaction.timetableEntry.deleteMany();
      await transaction.homework.deleteMany();
      await transaction.teacherAssignment.deleteMany();
      await transaction.behaviorCategory.deleteMany();
      await transaction.student.deleteMany();
      await transaction.staff.deleteMany();
      await transaction.class.deleteMany();
      await transaction.academicYear.deleteMany();
      await transaction.subject.deleteMany();
      await transaction.period.deleteMany();
      await transaction.guardian.deleteMany();
      await transaction.school.deleteMany();

      const school = await transaction.school.create({
        data: {
          name: schoolNameAr,
          nameEn: schoolNameEn,
          code: schoolCode,
          address: schoolAddressAr,
          addressEn: schoolAddressEn,
        },
      });

      const academicYear = await transaction.academicYear.create({
        data: {
          schoolId: school.id,
          name: "2026/2027",
          nameEn: "2026/2027",
          startsOn: new Date("2026-09-20"),
          endsOn: new Date("2027-06-30"),
          isCurrent: true,
        },
      });
      const math = await transaction.subject.create({
        data: { schoolId: school.id, name: "الرياضيات", nameEn: "Mathematics" },
      });
      const periods = await Promise.all(
        PERIODS.map((period) =>
          transaction.period.create({
            data: { ...period, schoolId: school.id },
          }),
        ),
      );
      await transaction.behaviorCategory.createMany({
        data: BEHAVIOR_CATEGORIES.map((category) => ({
          ...category,
          schoolId: school.id,
        })),
      });

      const class4A = await transaction.class.create({
        data: {
          name: class1NameAr,
          nameEn: class1NameEn,
          grade: class1GradeAr,
          gradeEn: class1GradeEn,
          schoolId: school.id,
          academicYearId: academicYear.id,
        },
      });
      const class2B = await transaction.class.create({
        data: {
          name: class2NameAr,
          nameEn: class2NameEn,
          grade: class2GradeAr,
          gradeEn: class2GradeEn,
          schoolId: school.id,
          academicYearId: academicYear.id,
        },
      });

      const guardian = await transaction.guardian.create({
        data: {
          phone: guardianPhone,
          nationalId: guardianNationalId,
          fullName: guardianNameAr,
          fullNameEn: guardianNameEn,
        },
      });

      const teacher = await transaction.staff.create({
        data: {
          email: teacherEmail,
          password: teacherPassword,
          fullName: teacherNameAr,
          fullNameEn: teacherNameEn,
          role: Role.TEACHER,
          schoolId: school.id,
        },
      });

      const assignments = await Promise.all(
        [class4A, class2B].map((schoolClass) =>
          transaction.teacherAssignment.create({
            data: {
              schoolId: school.id,
              staffId: teacher.id,
              classId: schoolClass.id,
              subjectId: math.id,
            },
          }),
        ),
      );
      const periodByNumber = new Map(periods.map((p) => [p.number, p.id]));
      const slots = [
        { assignment: assignments[0], classId: class4A.id, period: 3 },
        { assignment: assignments[1], classId: class2B.id, period: 4 },
      ];
      for (const slot of slots) {
        for (const weekday of SCHOOL_WEEK) {
          await transaction.timetableEntry.create({
            data: {
              schoolId: school.id,
              assignmentId: slot.assignment.id,
              staffId: teacher.id,
              classId: slot.classId,
              periodId: periodByNumber.get(slot.period)!,
              weekday,
            },
          });
        }
      }
      await transaction.homework.create({
        data: {
          schoolId: school.id,
          assignmentId: assignments[0].id,
          staffId: teacher.id,
          classId: class4A.id,
          title: "تمارين صفحة 45 – الضرب في عدد من رقمين",
          notes: "حل الأسئلة من 1 إلى 10 مع كتابة خطوات التفكير.",
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await transaction.staff.create({
        data: {
          email: adminEmail,
          password: adminPassword,
          fullName: adminNameAr,
          fullNameEn: adminNameEn,
          role: Role.SCHOOL_ADMIN,
          schoolId: school.id,
        },
      });

      await transaction.student.create({
        data: {
          nationalId: student1NationalId,
          fullName: student1NameAr,
          fullNameEn: student1NameEn,
          gender: student1Gender,
          guardianId: guardian.id,
          schoolId: school.id,
          classId: class4A.id,
        },
      });
      await transaction.student.create({
        data: {
          nationalId: student2NationalId,
          fullName: student2NameAr,
          fullNameEn: student2NameEn,
          gender: student2Gender,
          guardianId: guardian.id,
          schoolId: school.id,
          classId: class2B.id,
        },
      });

      await transaction.otpVerification.create({
        data: {
          identifier: guardianPhone,
          code: otpCode,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
    });

    console.info("Database seed completed successfully.");
  } catch (error) {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  } finally {
    await prismaService.$disconnect();
  }
}

void seed();
