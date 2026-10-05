import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import {
  GuardianRequestOtpDto,
  GuardianVerifyOtpDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";
import { AuthService } from "./auth.service.js";
import type { AuthUser } from "./auth-user.type.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import { Public } from "./decorators/public.decorator.js";
import { ANY_ROLE, Roles } from "./decorators/roles.decorator.js";

@Controller(["/auth", "/api/auth"])
export class AuthController {
  constructor(private authService: AuthService) {}
  @Public()
  @Post("/guardian/request-otp")
  @HttpCode(HttpStatus.OK)
  requestGuardianOtp(@Body() guardianRequestOtpDto: GuardianRequestOtpDto) {
    return this.authService.requestGuardianOtp(guardianRequestOtpDto);
  }
  @Public()
  @Post("/guardian/verify-otp")
  @HttpCode(HttpStatus.OK)
  verifyGuardianOtp(@Body() guardianVerifyOtpDto: GuardianVerifyOtpDto) {
    return this.authService.verifyGuardianOtp(guardianVerifyOtpDto);
  }
  @Public()
  @Post("/staff/login")
  @HttpCode(HttpStatus.OK)
  staffLogin(@Body() staffAuthLoginDto: StaffAuthLoginDto) {
    return this.authService.StaffLogin(staffAuthLoginDto);
  }
  /** Returns the authenticated user attached to the request by the auth guard. */
  @Roles(...ANY_ROLE)
  @Get("/me")
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
