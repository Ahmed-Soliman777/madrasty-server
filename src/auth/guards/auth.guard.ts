import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma.service.js";
import { AuthedRequest, AuthErrorCode, AuthUser } from "../auth-user.type.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { AccessTokenClaims, TokenService } from "../token.service.js";

const unauthorized = (code: string, message: string) =>
  new UnauthorizedException({
    statusCode: 401,
    error: "Unauthorized",
    code,
    message,
  });

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tokenService: TokenService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const origin = request.headers.origin;
    if (origin && !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!allowedOrigins.includes(origin)) {
        throw new ForbiddenException({
          code: "ORIGIN_NOT_ALLOWED",
          message: "Cross-origin request rejected",
        });
      }
    }

    const token = this.extractToken(request);
    if (!token) {
      throw unauthorized(AuthErrorCode.TokenMissing, "Authentication required");
    }

    let claims: AccessTokenClaims;
    try {
      claims = this.tokenService.verify(token);
    } catch {
      throw unauthorized(
        AuthErrorCode.TokenInvalid,
        "Invalid or expired token",
      );
    }

    request.user = await this.resolveUser(claims);
    return true;
  }

  private extractToken(request: AuthedRequest): string | undefined {
    const [scheme, bearerToken] = (request.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() === "bearer" && bearerToken) return bearerToken;

    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;

    const cookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("accessToken="));
    if (!cookie) return undefined;

    const value = cookie.slice("accessToken=".length);
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return value || undefined;
    }
  }

  private async resolveUser(claims: AccessTokenClaims): Promise<AuthUser> {
    if (claims.role === "guardian") {
      return {
        type: "guardian",
        id: claims.sub,
        role: "guardian",
        phone: claims.phone,
      };
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, schoolId: true, isActive: true },
    });
    if (!staff || !staff.isActive) {
      throw unauthorized(AuthErrorCode.AccountDisabled, "Account is disabled");
    }
    return {
      type: "staff",
      id: staff.id,
      role: staff.role,
      schoolId: staff.schoolId,
    };
  }
}
