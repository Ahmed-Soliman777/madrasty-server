import { IsEmail, IsNotEmpty, IsString, Matches } from "class-validator";

export class GuardianRequestOtpDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{14}$/)
  NationalId: string;
}

export class GuardianVerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/)
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
