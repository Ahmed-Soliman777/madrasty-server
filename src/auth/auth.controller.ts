import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  GuardianAuthLoginDto,
  GuardianOTPDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";
import { AuthService } from "./auth.service.js";

@Controller("/api/auth")
export class AuthController {
  constructor(private authService: AuthService) {}
  @Post("/guardian/login")
  @HttpCode(HttpStatus.OK)
  parentLogin(@Body() guardianAuthLoginDto: GuardianAuthLoginDto) {
    return this.authService.GuardianLogin(guardianAuthLoginDto);
  }
  @Post("/guardian/otp") // make it like: /guardian/otp/123
  @HttpCode(HttpStatus.OK)
  guardianOtpValidation(@Body() guardianOTPDto: GuardianOTPDto) {
    return this.authService.GuardianOTPValidation(guardianOTPDto);
  }
  @Post("/staff/login")
  @HttpCode(HttpStatus.OK)
  staffLogin(@Body() staffAuthLoginDto: StaffAuthLoginDto) {
    return this.authService.StaffLogin(staffAuthLoginDto);
  }
}
