import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthedRequest, AuthUser } from "../auth-user.type.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
