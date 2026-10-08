import { Controller, Get, Query } from "@nestjs/common";
import type { StaffUser } from "../auth/auth-user.type.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { QuickPortalQueryDto } from "./dtos/quick-portal-query.dto.js";
import { TeacherPortalService } from "./teacher-portal.service.js";

@Roles("TEACHER")
@Controller(["staff/me", "api/staff/me"])
export class TeacherPortalController {
  constructor(private teacherPortalService: TeacherPortalService) {}

  @Get("quick-portal")
  quickPortal(
    @CurrentUser() user: StaffUser,
    @Query() query: QuickPortalQueryDto,
  ) {
    return this.teacherPortalService.getQuickPortal(
      user,
      query.timetableEntryId,
    );
  }
}
