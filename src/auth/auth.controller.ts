import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import {
  ParentAuthLoginDto,
  StaffAuthLoginDto,
} from "./dtos/auth-login-dto.js";
import { AuthService } from "./auth.service.js";

@Controller("/api/auth")
export class AuthController {
  constructor(private authService: AuthService) {}
  @Post("/parent/login")
  @HttpCode(HttpStatus.OK)
  parentLogin(@Body() parentAuthLoginDto: ParentAuthLoginDto) {
    return this.authService.ParentLogin(parentAuthLoginDto);
  }
  @Post("/staff/login")
  @HttpCode(HttpStatus.OK)
  staffLogin(@Body() staffAuthLoginDto: StaffAuthLoginDto) {
    return this.authService.StaffLogin(staffAuthLoginDto);
  }
}
