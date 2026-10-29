import "dotenv/config";
import bcrypt from "bcrypt";
import {
  BehaviorKind,
  Gender,
  Role,
} from "../src/generated/prisma/enums.js";
import { PrismaService } from "../src/prisma.service.js";

const prismaService = new PrismaService();

type DemoClass = {
  nameAr: string;
  nameEn: string;
  gradeAr: string;
  gradeEn: string;
};

type DemoTeacher = {
  email: string;
  password: string;
  nameAr: string;
  nameEn: string;
  subjectNameEn: "Mathematics" | "Arabic Language" | "English Language";
};

type DemoStudent = {
  nationalId: string;
  nameAr: string;
  nameEn: string;
  gender: Gender;
  classNameEn: string;
  guardian: {
    phone: string;
    nationalId: string;
    nameAr: string;
    nameEn: string;
  };
};

const PERIODS = [
  { number: 1, startTime: "08:00", endTime: "08:45" },
  { number: 2, startTime: "09:00", endTime: "09:45" },
  { number: 3, startTime: "10:00", endTime: "10:45" },
  { number: 4, startTime: "11:00", endTime: "11:45" },
  { number: 5, startTime: "12:00", endTime: "12:45" },
  { number: 6, startTime: "13:00", endTime: "13:45" },
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

const SUBJECTS = [
  { name: "الرياضيات", nameEn: "Mathematics" },
  { name: "اللغة العربية", nameEn: "Arabic Language" },
  { name: "اللغة الإنجليزية", nameEn: "English Language" },
] as const;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requiredGender(name: string): Gender {
  const value = requiredEnv(name);
  if (value !== Gender.FEMALE && value !== Gender.MALE) {
    throw new Error(`${name} must be either FEMALE or MALE`);
  }
  return value;
}

function parseJsonEnv<T>(name: string): T {
  const raw = requiredEnv(name);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${name} must contain valid JSON`);
  }
}

function assertDemoData(
  classes: DemoClass[],
  teachers: DemoTeacher[],
  students: DemoStudent[],
) {
  if (classes.length !== 5) {
    throw new Error("SEED_DEMO_CLASSES_JSON must contain exactly five additional classes");
  }
  if (teachers.length !== 8) {
    throw new Error("SEED_DEMO_TEACHERS_JSON must contain eight additional teachers: two Mathematics, three Arabic, and three English");
  }
  const subjectCounts = new Map<string, number>();
  for (const teacher of teachers) {
    if (!teacher.email || !teacher.password || !teacher.nameAr || !teacher.nameEn) {
      throw new Error("Every demo teacher requires email, password, nameAr, and nameEn");
    }
    subjectCounts.set(teacher.subjectNameEn, (subjectCounts.get(teacher.subjectNameEn) ?? 0) + 1);
  }
  if (
    subjectCounts.get("Mathematics") !== 2 ||
    subjectCounts.get("Arabic Language") !== 3 ||
    subjectCounts.get("English Language") !== 3
  ) {
    throw new Error("Demo teachers must include two additional Mathematics teachers and three teachers for each other subject");
  }
  const classNames = new Set<string>();
  for (const schoolClass of classes) {
    if (!schoolClass.nameAr || !schoolClass.nameEn || !schoolClass.gradeAr || !schoolClass.gradeEn) {
      throw new Error("Every demo class requires Arabic and English names and grade labels");
    }
    if (classNames.has(schoolClass.nameEn)) {
      throw new Error(`Duplicate demo class name: ${schoolClass.nameEn}`);
    }
    classNames.add(schoolClass.nameEn);
  }
  const teacherEmails = new Set<string>();
  for (const teacher of teachers) {
    if (teacherEmails.has(teacher.email.toLowerCase())) {
      throw new Error(`Duplicate demo teacher email: ${teacher.email}`);
    }
    teacherEmails.add(teacher.email.toLowerCase());
  }
  const studentIds = new Set<string>();
  const rosterCounts = new Map<string, number>();
  for (const student of students) {
    if (!student.nationalId || !student.nameAr || !student.nameEn || !student.classNameEn) {
      throw new Error("Every demo student requires nationalId, bilingual names, and classNameEn");
    }
    if (studentIds.has(student.nationalId)) {
      throw new Error(`Duplicate demo student national ID in environment configuration: ${student.nationalId}`);
    }
    studentIds.add(student.nationalId);
    rosterCounts.set(student.classNameEn, (rosterCounts.get(student.classNameEn) ?? 0) + 1);
    if (student.gender !== Gender.FEMALE && student.gender !== Gender.MALE) {
      throw new Error(`Invalid gender for demo student ${student.nationalId}`);
    }
    if (!student.guardian?.phone || !student.guardian?.nationalId || !student.guardian?.nameAr || !student.guardian?.nameEn) {
      throw new Error(`Missing guardian data for demo student ${student.nationalId}`);
    }
  }
  if (students.length !== 68) {
    throw new Error("SEED_DEMO_STUDENTS_JSON must contain 68 additional students");
  }
  if (rosterCounts.get("LEGACY_CLASS_1") !== 9 || rosterCounts.get("LEGACY_CLASS_2") !== 9) {
    throw new Error("The two existing classes must each have exactly nine additional students");
  }
  for (const schoolClass of classes) {
    if (rosterCounts.get(schoolClass.nameEn) !== 10) {
      throw new Error(`Demo class ${schoolClass.nameEn} must have exactly ten students`);
    }
  }
  for (const configuredClassName of rosterCounts.keys()) {
    if (configuredClassName !== "LEGACY_CLASS_1" && configuredClassName !== "LEGACY_CLASS_2" && !classNames.has(configuredClassName)) {
      throw new Error(`Student roster references an unknown class: ${configuredClassName}`);
    }
  }
}

async function seed() {
  try {
    const schoolCode = requiredEnv("SEED_SCHOOL_CODE");
    const teacherEmail = requiredEnv("SEED_TEACHER_EMAIL");
    const teacherPassword = requiredEnv("SEED_TEACHER_PASSWORD");
    const teacherNameAr = requiredEnv("SEED_TEACHER_NAME_AR");
    const teacherNameEn = requiredEnv("SEED_TEACHER_NAME_EN");
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

    const demoClasses = parseJsonEnv<DemoClass[]>("SEED_DEMO_CLASSES_JSON");
    const demoTeachers = parseJsonEnv<DemoTeacher[]>("SEED_DEMO_TEACHERS_JSON");
    const demoStudents = parseJsonEnv<DemoStudent[]>("SEED_DEMO_STUDENTS_JSON");
    assertDemoData(demoClasses, demoTeachers, demoStudents);
    if (demoClasses.some((item) => item.nameEn === class1NameEn || item.nameEn === class2NameEn)) {
      throw new Error("Additional class names must not duplicate either existing class.");
    }
    if (demoTeachers.some((item) => item.email.toLowerCase() === teacherEmail.toLowerCase())) {
      throw new Error("A demo teacher email duplicates the existing Mathematics teacher email.");
    }
    if (demoStudents.some((item) => item.nationalId === student1NationalId || item.nationalId === student2NationalId)) {
      throw new Error("A demo student national ID duplicates one of the two existing students.");
    }

    const school = await prismaService.school.findUnique({ where: { code: schoolCode } });
    if (!school) {
      throw new Error(
        "The school identified by SEED_SCHOOL_CODE does not exist. This seed intentionally does not create or modify school records.",
      );
    }
    const academicYear = await prismaService.academicYear.findFirst({
      where: { schoolId: school.id, isCurrent: true },
      orderBy: { startsOn: "desc" },
    });
    if (!academicYear) {
      throw new Error("No current academic year exists for the configured school; this seed does not create academic-year records.");
    }

    await prismaService.$transaction(async (transaction) => {
      const legacyGuardian = await transaction.guardian.findUnique({
        where: { phone: guardianPhone },
      });
      const guardian = legacyGuardian ?? await transaction.guardian.create({
        data: {
          phone: guardianPhone,
          nationalId: guardianNationalId,
          fullName: guardianNameAr,
          fullNameEn: guardianNameEn,
        },
      });
      if (guardian.nationalId && guardian.nationalId !== guardianNationalId) {
        throw new Error("SEED_GUARDIAN_PHONE already belongs to a guardian with a different national ID.");
      }

      const legacyTeacher = await transaction.staff.findUnique({
        where: { email: teacherEmail },
      }) ?? await transaction.staff.create({
        data: {
          email: teacherEmail,
          password: await bcrypt.hash(teacherPassword, 10),
          fullName: teacherNameAr,
          fullNameEn: teacherNameEn,
          role: Role.TEACHER,
          schoolId: school.id,
        },
      });
      if (legacyTeacher.schoolId !== school.id || legacyTeacher.role !== Role.TEACHER) {
        throw new Error("SEED_TEACHER_EMAIL must belong to a teacher in the configured school.");
      }

      const subjects = new Map<string, { id: string; name: string; nameEn: string }>();
      for (const subjectData of SUBJECTS) {
        const subject = await transaction.subject.findFirst({
          where: { schoolId: school.id, nameEn: subjectData.nameEn },
        }) ?? await transaction.subject.create({
          data: { schoolId: school.id, ...subjectData },
        });
        subjects.set(subject.nameEn, subject);
      }

      const periods = await Promise.all(
        PERIODS.map(async (period) => {
          return transaction.period.findFirst({
            where: { schoolId: school.id, number: period.number },
          }) ?? transaction.period.create({
            data: { ...period, schoolId: school.id },
          });
        }),
      );
      void periods;

      for (const category of BEHAVIOR_CATEGORIES) {
        const existing = await transaction.behaviorCategory.findFirst({
          where: { schoolId: school.id, code: category.code },
        });
        if (!existing) {
          await transaction.behaviorCategory.create({
            data: { ...category, schoolId: school.id },
          });
        }
      }

      const legacyClassConfigs: DemoClass[] = [
        { nameAr: class1NameAr, nameEn: class1NameEn, gradeAr: class1GradeAr, gradeEn: class1GradeEn },
        { nameAr: class2NameAr, nameEn: class2NameEn, gradeAr: class2GradeAr, gradeEn: class2GradeEn },
      ];
      const allClassConfigs = [...legacyClassConfigs, ...demoClasses];
      const classesByNameEn = new Map<string, { id: string; name: string; nameEn: string; grade: string; gradeEn: string }>();
      for (const classData of allClassConfigs) {
        const existing = await transaction.class.findFirst({
          where: { schoolId: school.id, academicYearId: academicYear.id, nameEn: classData.nameEn },
        });
        const schoolClass = existing ?? await transaction.class.create({
          data: {
            schoolId: school.id,
            academicYearId: academicYear.id,
            name: classData.nameAr,
            nameEn: classData.nameEn,
            grade: classData.gradeAr,
            gradeEn: classData.gradeEn,
          },
        });
        classesByNameEn.set(schoolClass.nameEn, schoolClass);
      }

      const existingLegacyStudents = [
        {
          nationalId: student1NationalId,
          nameAr: student1NameAr,
          nameEn: student1NameEn,
          gender: student1Gender,
          classNameEn: class1NameEn,
        },
        {
          nationalId: student2NationalId,
          nameAr: student2NameAr,
          nameEn: student2NameEn,
          gender: student2Gender,
          classNameEn: class2NameEn,
        },
      ];
      for (const studentData of existingLegacyStudents) {
        const schoolClass = classesByNameEn.get(studentData.classNameEn);
        if (!schoolClass) throw new Error(`Missing configured class ${studentData.classNameEn}`);
        const existingStudent = await transaction.student.findUnique({
          where: { nationalId: studentData.nationalId },
        });
        if (!existingStudent) {
          await transaction.student.create({
            data: {
              nationalId: studentData.nationalId,
              fullName: studentData.nameAr,
              fullNameEn: studentData.nameEn,
              gender: studentData.gender,
              guardianId: guardian.id,
              schoolId: school.id,
              classId: schoolClass.id,
            },
          });
        }
      }

      const demoTeachersBySubject = new Map<string, Array<{ id: string }>>();
      for (const teacherData of demoTeachers) {
        const existing = await transaction.staff.findUnique({ where: { email: teacherData.email } });
        let demoTeacher = existing;
        if (!demoTeacher) {
          demoTeacher = await transaction.staff.create({
            data: {
              email: teacherData.email,
              password: await bcrypt.hash(teacherData.password, 10),
              fullName: teacherData.nameAr,
              fullNameEn: teacherData.nameEn,
              role: Role.TEACHER,
              schoolId: school.id,
            },
          });
        }
        if (demoTeacher.schoolId !== school.id || demoTeacher.role !== Role.TEACHER) {
          throw new Error(`Demo teacher email ${teacherData.email} is already used outside the configured school or by a non-teacher role.`);
        }
        const group = demoTeachersBySubject.get(teacherData.subjectNameEn) ?? [];
        group.push({ id: demoTeacher.id });
        demoTeachersBySubject.set(teacherData.subjectNameEn, group);
      }

      const mathTeacherGroup = [
        { id: legacyTeacher.id },
        ...(demoTeachersBySubject.get("Mathematics") ?? []),
      ];
      demoTeachersBySubject.set("Mathematics", mathTeacherGroup);

      for (const studentData of demoStudents) {
        const resolvedClassNameEn = studentData.classNameEn === "LEGACY_CLASS_1"
          ? class1NameEn
          : studentData.classNameEn === "LEGACY_CLASS_2"
            ? class2NameEn
            : studentData.classNameEn;
        const schoolClass = classesByNameEn.get(resolvedClassNameEn);
        if (!schoolClass) {
          throw new Error(`Student ${studentData.nationalId} references unknown class ${studentData.classNameEn}`);
        }
        let studentGuardian = await transaction.guardian.findUnique({
          where: { phone: studentData.guardian.phone },
        });
        if (studentGuardian && studentGuardian.nationalId && studentGuardian.nationalId !== studentData.guardian.nationalId) {
          throw new Error(`Guardian phone ${studentData.guardian.phone} is already linked to a different national ID.`);
        }
        const guardianByNationalId = await transaction.guardian.findFirst({
          where: { nationalId: studentData.guardian.nationalId },
        });
        if (guardianByNationalId && guardianByNationalId.phone !== studentData.guardian.phone) {
          throw new Error(`Guardian national ID ${studentData.guardian.nationalId} is already linked to a different phone.`);
        }
        if (!studentGuardian) {
          studentGuardian = guardianByNationalId ?? await transaction.guardian.create({
            data: {
              phone: studentData.guardian.phone,
              nationalId: studentData.guardian.nationalId,
              fullName: studentData.guardian.nameAr,
              fullNameEn: studentData.guardian.nameEn,
            },
          });
        }
        const existingStudent = await transaction.student.findUnique({
          where: { nationalId: studentData.nationalId },
        });
        if (!existingStudent) {
          await transaction.student.create({
            data: {
              nationalId: studentData.nationalId,
              fullName: studentData.nameAr,
              fullNameEn: studentData.nameEn,
              gender: studentData.gender,
              guardianId: studentGuardian.id,
              schoolId: school.id,
              classId: schoolClass.id,
            },
          });
        }
      }

      for (const classData of allClassConfigs) {
        const schoolClass = classesByNameEn.get(classData.nameEn);
        if (!schoolClass) throw new Error(`Missing class after seed setup: ${classData.nameEn}`);
        const activeStudentCount = await transaction.student.count({
          where: { schoolId: school.id, classId: schoolClass.id, isActive: true },
        });
        if (activeStudentCount !== 10) {
          throw new Error(`Class ${classData.nameEn} has ${activeStudentCount} active students after seeding; expected exactly ten. No changes were committed.`);
        }
      }

      for (let classIndex = 0; classIndex < allClassConfigs.length; classIndex++) {
        const classData = allClassConfigs[classIndex];
        const schoolClass = classesByNameEn.get(classData.nameEn);
        if (!schoolClass) continue;
        for (const subjectData of SUBJECTS) {
          const teacherGroup = demoTeachersBySubject.get(subjectData.nameEn) ?? [];
          const selectedTeacher =
            subjectData.nameEn === "Mathematics" && classIndex < 2
              ? legacyTeacher
              : teacherGroup[classIndex % teacherGroup.length];
          if (!selectedTeacher) {
            throw new Error(`No qualified teacher configured for subject ${subjectData.nameEn}`);
          }
          const subject = subjects.get(subjectData.nameEn);
          if (!subject) throw new Error(`Subject ${subjectData.nameEn} was not initialized`);
          const existingAssignment = await transaction.teacherAssignment.findFirst({
            where: {
              staffId: selectedTeacher.id,
              classId: schoolClass.id,
              subjectId: subject.id,
            },
          });
          if (!existingAssignment) {
            await transaction.teacherAssignment.create({
              data: {
                schoolId: school.id,
                staffId: selectedTeacher.id,
                classId: schoolClass.id,
                subjectId: subject.id,
                lessonsPerWeek: 5,
              },
            });
          }
        }
      }

      const legacyClass = classesByNameEn.get(class1NameEn);
      const mathSubject = subjects.get("Mathematics");
      if (legacyClass && mathSubject) {
        const legacyMathAssignment = await transaction.teacherAssignment.findFirst({
          where: {
            schoolId: school.id,
            staffId: legacyTeacher.id,
            classId: legacyClass.id,
            subjectId: mathSubject.id,
          },
        });
        if (legacyMathAssignment) {
          const homeworkTitle = "تمارين صفحة 45 – الضرب في عدد من رقمين";
          const existingHomework = await transaction.homework.findFirst({
            where: {
              schoolId: school.id,
              assignmentId: legacyMathAssignment.id,
              title: homeworkTitle,
              deletedAt: null,
            },
          });
          if (!existingHomework) {
            await transaction.homework.create({
              data: {
                schoolId: school.id,
                assignmentId: legacyMathAssignment.id,
                staffId: legacyTeacher.id,
                classId: legacyClass.id,
                title: homeworkTitle,
                notes: "حل الأسئلة من 1 إلى 10 مع كتابة خطوات التفكير.",
                dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
            });
          }
        }
      }

      const otpCode = process.env.SEED_TEST_OTP_CODE?.trim();
      if (otpCode) {
        const existingOtp = await transaction.otpVerification.findFirst({
          where: { identifier: guardianPhone, code: otpCode, isUsed: false },
        });
        if (!existingOtp) {
          await transaction.otpVerification.create({
            data: {
              identifier: guardianPhone,
              code: otpCode,
              expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            },
          });
        }
      }
    });

    console.info("Additive database seed completed successfully. Existing records were not deleted or overwritten.");
    console.info("No timetable or timetable entries were created.");
  } catch (error) {
    console.error("Additive database seed failed:", error);
    process.exitCode = 1;
  } finally {
    await prismaService.$disconnect();
  }
}

void seed();
