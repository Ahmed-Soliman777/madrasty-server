import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma.service.js";
import { AuthedRequest, AuthErrorCode, AuthUser } from "../auth-user.type.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { AccessTokenClaims, TokenService } from "../token.service.js";

/** Creates a 401 exception with a client-facing error code and message. */
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

  /**
   * Allows public routes immediately; otherwise authenticates a bearer token,
   * attaches the resolved user to the HTTP request, and returns true.
   * Handler metadata takes precedence over controller metadata.
   *
   * @throws {UnauthorizedException} If the token is missing, verification fails,
   * or the staff account is missing or inactive. Database errors propagate.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractBearerToken(request);
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

  /**
   * Returns the token after a case-insensitive Bearer scheme, or undefined if
   * the scheme or token is missing. Requires a single separating space and
   * ignores any fields after the token.
   */
  private extractBearerToken(request: AuthedRequest): string | undefined {
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
  }

  /**
   * Builds guardian identity directly from claims with role "guardian",
   * including legacy tokens without a type. Otherwise loads current staff
   * identity, role, school, and active status from the database.
   *
   * @throws {UnauthorizedException} If the staff account is missing or inactive.
   * Database errors propagate to the caller.
   */
  private async resolveUser(claims: AccessTokenClaims): Promise<AuthUser> {
    // tokens القديمة (قبل التوحيد) مفيهاش type، بس role = "guardian"
    if (claims.role === "guardian") {
      return {
        type: "guardian",
        id: claims.sub,
        role: "guardian",
        phone: claims.phone,
      };
    }

    // الـ staff: الدور والمدرسة والتفعيل بيتقروا من الداتابيز (PK lookup) مش من الـ token،
    // فتعطيل معلم أو تغيير دوره بيسري فوراً حتى لو الـ token لسه صالح
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
