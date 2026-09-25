import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class ParentAuthLoginDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(14)
  NationalId: string;
  @IsNotEmpty()
  LoginOTP: string[];
}

export class StaffAuthLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
  @IsNotEmpty()
  @IsString()
  password: string;
}
