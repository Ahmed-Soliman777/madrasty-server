import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import {
  ParentAuthLoginDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";

@Injectable()
export class AuthService {
  constructor(private prismaService: PrismaService) {}
  ParentLogin({ NationalId, LoginOTP }: ParentAuthLoginDto) {
    const id = "30201013020100",
      otp = ["1", "2", "3", "4"];

    const isOtpValid = LoginOTP.join("") === otp.join("");

    if (NationalId === id && isOtpValid) {
      return "welcome back!";
    } else throw new UnauthorizedException("Invalid credentials");
  }
  StaffLogin({ email, password }: StaffAuthLoginDto) {
    const id = "staff@mail.com",
      otp = "123456789";

    if (email === id && password === otp) {
      return "welcome back!";
    } else throw new UnauthorizedException("Invalid email or password");
  }
}
