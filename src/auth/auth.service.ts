import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import * as bcrypt from "bcrypt";
import {
  GuardianAuthLoginDto,
  GuardianOTPDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async compareStaffPassword(staffBodyPassword: string, staffPassword: string) {
    return await bcrypt.compare(staffBodyPassword, staffPassword);
  }

  async GuardianLogin({ NationalId }: GuardianAuthLoginDto) {
    if (!NationalId) {
      throw new BadRequestException("Please enter a valid student national id");
    }

    try {
      const student = await this.prisma.student.findUnique({
        where: { nationalId: NationalId },
        select: {
          class: true,
          dateOfBirth: true,
          fullName: true,
          fullNameEn: true,
          gender: true,
          nationalId: true,
          school: {
            select: {
              name: true,
              nameEn: true,
              address: true,
              addressEn: true,
            },
          },
          guardian: {
            select: {
              fullName: true,
              fullNameEn: true,
              phone: true,
            },
          },
        },
      });

      if (!student) {
        throw new UnauthorizedException("Invalid Student National ID");
      }

      return { message: `OTP is sent to your phone, please verify.` };
    } catch (error) {
      console.error(error);
      return "Invalid Credentials";
    }
  }

  async GuardianOTPValidation({ LoginOTP }: GuardianOTPDto) {
    if (!LoginOTP) {
      throw new Error("Please enter a valid OTP");
    }
    const otpVerification = await this.prisma.otpVerification.findUnique({
      where: { code: LoginOTP },
    });

    if (!otpVerification?.code) throw new UnauthorizedException("Invalid OTP");
    return { message: "verified" };
  }

  async StaffLogin({ email, password }: StaffAuthLoginDto) {
    if (!email || !password) {
      throw new BadRequestException("Please enter login credentials");
    }
    const staff = await this.prisma.staff.findUnique({
      where: { email },
    });
    if (!staff || !staff.password) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const staffPasswordValidation = await bcrypt.compare(
      password,
      staff.password,
    );
    if (!staffPasswordValidation)
      throw new UnauthorizedException("Invalid credentials!");
    return `token`;
  }
}
