import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class GuardianAuthLoginDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(14)
  NationalId: string;
}

export class GuardianOTPDto {
  @IsNotEmpty()
  LoginOTP: string;
}

export class StaffAuthLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
  @IsNotEmpty()
  @IsString()
  password: string;
}
