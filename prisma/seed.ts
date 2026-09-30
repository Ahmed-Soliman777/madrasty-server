import "dotenv/config";
import bcrypt from "bcrypt";
import { Gender, Role } from "../src/generated/prisma/enums.js";
import { PrismaService } from "../src/prisma.service.js";

const prismaService = new PrismaService();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
      await transaction.student.deleteMany();
      await transaction.staff.deleteMany();
      await transaction.class.deleteMany();
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

      const class4A = await transaction.class.create({
        data: {
          name: class1NameAr,
          nameEn: class1NameEn,
          grade: class1GradeAr,
          gradeEn: class1GradeEn,
          schoolId: school.id,
        },
      });
      const class2B = await transaction.class.create({
        data: {
          name: class2NameAr,
          nameEn: class2NameEn,
          grade: class2GradeAr,
          gradeEn: class2GradeEn,
          schoolId: school.id,
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

      await transaction.staff.create({
        data: {
          email: teacherEmail,
          password: teacherPassword,
          fullName: teacherNameAr,
          fullNameEn: teacherNameEn,
          role: Role.TEACHER,
          schoolId: school.id,
          classes: { connect: [{ id: class4A.id }, { id: class2B.id }] },
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
