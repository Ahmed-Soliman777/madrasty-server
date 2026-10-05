import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppRole, AuthedRequest, AuthErrorCode } from "../auth-user.type.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { ROLES_KEY } from "../decorators/roles.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: "Unauthorized",
        code: AuthErrorCode.TokenMissing,
        message: "Authentication required",
      });
    }

    const required = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      targets,
    );
    if (!required?.length) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} has no @Roles() or @Public()`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: AuthErrorCode.RolesNotDeclared,
        message: "Access denied",
      });
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: AuthErrorCode.ForbiddenRole,
        message: "You do not have access to this resource",
      });
    }
    return true;
  }
}
