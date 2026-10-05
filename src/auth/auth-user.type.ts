import type { Request } from "express";
import type { Role } from "../generated/prisma/enums.js";

export type AppRole = Role | "guardian";

export interface StaffUser {
  type: "staff";
  id: string;
  role: Role;
  schoolId: string;
}

export interface GuardianUser {
  type: "guardian";
  id: string;
  role: "guardian";
  phone: string;
}

export type AuthUser = StaffUser | GuardianUser;

export type AuthedRequest = Request & { user?: AuthUser };

// أكواد الأخطاء: الفرونت بيترجمها من messages (errors.<code>) بدل ما يعرض نص السيرفر
export const AuthErrorCode = {
  TokenMissing: "AUTH_TOKEN_MISSING",
  TokenInvalid: "AUTH_TOKEN_INVALID",
  AccountDisabled: "AUTH_ACCOUNT_DISABLED",
  ForbiddenRole: "AUTH_FORBIDDEN_ROLE",
  RolesNotDeclared: "AUTH_ROLES_NOT_DECLARED",
} as const;
