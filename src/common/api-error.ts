import { HttpException, HttpStatus } from "@nestjs/common";

export const apiError = (
  status: HttpStatus,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) => new HttpException({ statusCode: status, code, message, ...extra }, status);
