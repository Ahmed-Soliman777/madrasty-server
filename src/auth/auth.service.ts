import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { PrismaService } from "../prisma.service.js";
import * as bcrypt from "bcrypt";
import {
  GuardianRequestOtpDto,
  GuardianVerifyOtpDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";
import { normalizeEgyptianPhone, WhatsappService } from "./whatsapp.service.js";
import { TokenService } from "./token.service.js";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
    private tokenService: TokenService,
  ) {}

  async compareStaffPassword(staffBodyPassword: string, staffPassword: string) {
    return await bcrypt.compare(staffBodyPassword, staffPassword);
  }

  async requestGuardianOtp({ NationalId }: GuardianRequestOtpDto) {
    if (!/^\d{14}$/.test(NationalId)) {
      throw new BadRequestException("Enter a valid 14-digit national ID");
    }

    const student = await this.prisma.student.findUnique({
      where: { nationalId: NationalId },
      select: { guardian: { select: { phone: true } } },
    });

    const phoneDigits = student
      ? normalizeEgyptianPhone(student.guardian.phone)
      : null;
    if (!phoneDigits) throw new UnauthorizedException("Invalid login details");

    const phone = `+${phoneDigits}`;
    await this.prisma.otpVerification.updateMany({
      where: { identifier: phone, isUsed: false },
      data: { isUsed: true },
    });

    const LoginOTP = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const otpVerification = await this.prisma.otpVerification.create({
      data: {
        identifier: phone,
        code: LoginOTP,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const sent = await this.whatsappService.sendOtp(phone, LoginOTP);
    if (!sent) {
      await this.prisma.otpVerification.update({
        where: { id: otpVerification.id },
        data: { isUsed: true },
      });
      throw new ServiceUnavailableException("WhatsApp OTP delivery failed");
    }

    const localPhone = `0${phoneDigits.slice(2)}`;
    return {
      message: "OTP sent via WhatsApp",
      phone,
      maskedPhone: `${localPhone.slice(0, 3)}****${localPhone.slice(-4)}`,
    };
  }

  async verifyGuardianOtp({ phone, LoginOTP }: GuardianVerifyOtpDto) {
    const phoneDigits = normalizeEgyptianPhone(phone);
    if (!phoneDigits || !/^\d{6}$/.test(LoginOTP)) {
      throw new UnauthorizedException("Invalid or expired OTP");
    }

    const normalizedPhone = `+${phoneDigits}`;
    const otpVerification = await this.prisma.otpVerification.findFirst({
      where: {
        identifier: normalizedPhone,
        code: LoginOTP,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpVerification) {
      throw new UnauthorizedException("Invalid or expired OTP");
    }

    const consumed = await this.prisma.otpVerification.updateMany({
      where: {
        id: otpVerification.id,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      data: { isUsed: true },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException("Invalid or expired OTP");
    }

    const guardian = await this.prisma.guardian.findUnique({
      where: { phone: normalizedPhone },
      select: {
        id: true,
        fullName: true,
        fullNameEn: true,
        phone: true,
        students: {
          select: {
            id: true,
            fullName: true,
            fullNameEn: true,
            gender: true,
            class: {
              select: { name: true, nameEn: true, grade: true, gradeEn: true },
            },
            school: { select: { name: true, nameEn: true } },
          },
        },
      },
    });
    if (!guardian) throw new UnauthorizedException("Invalid login details");

    return {
      message: "Login successful",
      accessToken: this.tokenService.sign({
        type: "guardian",
        sub: guardian.id,
        phone: normalizedPhone,
      }),
      guardian,
    };
  }

  async guardianPortal(guardianId: string) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      select: {
        id: true,
        fullName: true,
        fullNameEn: true,
        students: {
          where: { isActive: true },
          select: {
            id: true,
            fullName: true,
            fullNameEn: true,
            schoolId: true,
            classId: true,
            class: {
              select: {
                name: true,
                nameEn: true,
                grade: true,
                gradeEn: true,
                academicYear: { select: { startsOn: true } },
              },
            },
            attendanceRecords: {
              orderBy: { session: { date: "desc" } },
              take: 30,
              select: {
                id: true,
                status: true,
                arrivedAt: true,
                session: { select: { date: true } },
              },
            },
            behaviorRecords: {
              where: { voidedAt: null },
              orderBy: { createdAt: "desc" },
              take: 30,
              select: {
                id: true,
                points: true,
                createdAt: true,
                category: { select: { name: true, nameEn: true, kind: true } },
              },
            },
          },
        },
      },
    });

    if (!guardian) throw new UnauthorizedException("Guardian account not found");

    const classIds = [...new Set(guardian.students.map((student) => student.classId))];
    const homework = classIds.length
      ? await this.prisma.homework.findMany({
          where: {
            classId: { in: classIds },
            deletedAt: null,
          },
          select: {
            id: true,
            classId: true,
            title: true,
            dueAt: true,
            createdAt: true,
          },
          orderBy: { dueAt: "asc" },
        })
      : [];

    const homeworkByClass = new Map<string, typeof homework>();
    for (const item of homework) {
      const existing = homeworkByClass.get(item.classId) ?? [];
      existing.push(item);
      homeworkByClass.set(item.classId, existing);
    }

    return {
      guardian: {
        id: guardian.id,
        fullName: guardian.fullName,
        fullNameEn: guardian.fullNameEn,
      },
      students: guardian.students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        fullNameEn: student.fullNameEn,
        grade: student.class.grade,
        gradeEn: student.class.gradeEn,
        className: student.class.name,
        classNameEn: student.class.nameEn,
        attendanceRecords: student.attendanceRecords.map((record) => ({
          id: record.id,
          date: record.session.date.toISOString().slice(0, 10),
          status: record.status,
          arrivedAt: record.arrivedAt?.toISOString() ?? null,
        })),
        behaviorRecords: student.behaviorRecords.map((record) => ({
          id: record.id,
          categoryName: record.category.name,
          categoryNameEn: record.category.nameEn,
          kind: record.category.kind,
          points: record.points,
          createdAt: record.createdAt.toISOString(),
        })),
        homework: (homeworkByClass.get(student.classId) ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          dueAt: item.dueAt.toISOString(),
          createdAt: item.createdAt.toISOString(),
        })),
      })),
    };
  }

  async StaffLogin({ email, password }: StaffAuthLoginDto) {
    if (!email || !password) {
      throw new BadRequestException("Please enter login credentials");
    }
    const staff = await this.prisma.staff.findUnique({
      where: { email },
    });
    if (!staff || !staff.password || !staff.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const staffPasswordValidation = await bcrypt.compare(
      password,
      staff.password,
    );
    if (!staffPasswordValidation)
      throw new UnauthorizedException("Invalid credentials!");
    return {
      message: "welcome",
      accessToken: this.tokenService.sign({
        type: "staff",
        sub: staff.id,
        role: staff.role,
        schoolId: staff.schoolId,
      }),
      staff: {
        id: staff.id,
        fullName: staff.fullName,
        fullNameEn: staff.fullNameEn,
        role: staff.role,
        schoolId: staff.schoolId,
      },
    };
  }
}
