import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from "@nestjs/common";
import type { Response as ExpressResponse } from "express";
import {
  GuardianRequestOtpDto,
  GuardianVerifyOtpDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";
import { AuthService } from "./auth.service.js";
import type { AuthUser, GuardianUser } from "./auth-user.type.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import { Public } from "./decorators/public.decorator.js";
import { ANY_ROLE, Roles } from "./decorators/roles.decorator.js";

const COOKIE_NAME = "accessToken";

function cookieOptions() {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: (Number(process.env.JWT_EXPIRES_IN_SECONDS) || 60 * 60) * 1000,
    ...(domain ? { domain } : {}),
  };
}

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
  async verifyGuardianOtp(
    @Body() guardianVerifyOtpDto: GuardianVerifyOtpDto,
    @Headers("x-client-type") clientType: string | undefined,
    @Res({ passthrough: true }) response: ExpressResponse,
  ) {
    const result = await this.authService.verifyGuardianOtp(guardianVerifyOtpDto);
    if (clientType !== "web") return result;

    response.cookie(COOKIE_NAME, result.accessToken, cookieOptions());
    const { accessToken: _accessToken, ...publicResult } = result;
    return { ...publicResult, authenticated: true };
  }

  @Public()
  @Post("/staff/login")
  @HttpCode(HttpStatus.OK)
  async staffLogin(
    @Body() staffAuthLoginDto: StaffAuthLoginDto,
    @Headers("x-client-type") clientType: string | undefined,
    @Res({ passthrough: true }) response: ExpressResponse,
  ) {
    const result = await this.authService.StaffLogin(staffAuthLoginDto);
    if (clientType !== "web") return result;

    response.cookie(COOKIE_NAME, result.accessToken, cookieOptions());
    const { accessToken: _accessToken, ...publicResult } = result;
    return { ...publicResult, authenticated: true };
  }

  @Public()
  @Post("/logout")
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) response: ExpressResponse) {
    const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
    response.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(domain ? { domain } : {}),
    });
    return { authenticated: false };
  }

  @Roles("guardian")
  @Get("/guardian/portal")
  guardianPortal(@CurrentUser() user: GuardianUser) {
    return this.authService.guardianPortal(user.id);
  }

  @Roles(...ANY_ROLE)
  @Get("/me")
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
