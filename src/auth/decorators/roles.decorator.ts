import { SetMetadata } from "@nestjs/common";
import { Role } from "../../generated/prisma/enums.js";
import type { AppRole } from "../auth-user.type.js";

export const ROLES_KEY = "roles";

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

export const ANY_STAFF: AppRole[] = Object.values(Role);
export const ANY_ROLE: AppRole[] = [...ANY_STAFF, "guardian"];
