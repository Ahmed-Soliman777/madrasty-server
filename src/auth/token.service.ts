import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtModuleOptions, JwtService } from "@nestjs/jwt";
import type { Role } from "../generated/prisma/enums.js";

export type AccessTokenPayload =
  | { type: "guardian"; sub: string; role: "guardian"; phone: string }
  | { type: "staff"; sub: string; role: Role; schoolId: string };

export type AccessTokenClaims = AccessTokenPayload & {
  iat: number;
  exp: number;
};
export type SignAccessTokenInput =
  | { type: "guardian"; sub: string; phone: string }
  | { type: "staff"; sub: string; role: Role; schoolId: string };

const ALGORITHM = "HS256" as const;
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60;

export function jwtConfigFactory(): JwtModuleOptions {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is not configured");
  if (secret.length < 32) {
    new Logger("JwtConfig").warn(
      "JWT_SECRET is shorter than 32 characters; use a longer random secret",
    );
  }
  return {
    secret,
    signOptions: {
      algorithm: ALGORITHM,
      expiresIn:
        Number(process.env.JWT_EXPIRES_IN_SECONDS) ||
        DEFAULT_EXPIRES_IN_SECONDS,
    },
    verifyOptions: { algorithms: [ALGORITHM] },
  };
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(input: SignAccessTokenInput): string {
    const payload: AccessTokenPayload =
      input.type === "guardian" ? { ...input, role: "guardian" } : input;
    return this.jwt.sign(payload);
  }

  verify(token: string): AccessTokenClaims {
    try {
      return this.jwt.verify<AccessTokenClaims>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
