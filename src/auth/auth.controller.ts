import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  GuardianRequestOtpDto,
  GuardianVerifyOtpDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";
import { AuthService } from "./auth.service.js";

@Controller(["/auth", "/api/auth"])
export class AuthController {
  constructor(private authService: AuthService) {}
  @Post("/guardian/request-otp")
  @HttpCode(HttpStatus.OK)
  requestGuardianOtp(@Body() guardianRequestOtpDto: GuardianRequestOtpDto) {
    return this.authService.requestGuardianOtp(guardianRequestOtpDto);
  }
  @Post("/guardian/verify-otp")
  @HttpCode(HttpStatus.OK)
  verifyGuardianOtp(@Body() guardianVerifyOtpDto: GuardianVerifyOtpDto) {
    return this.authService.verifyGuardianOtp(guardianVerifyOtpDto);
  }
  @Post("/staff/login")
  @HttpCode(HttpStatus.OK)
  staffLogin(@Body() staffAuthLoginDto: StaffAuthLoginDto) {
    return this.authService.StaffLogin(staffAuthLoginDto);
  }
}
