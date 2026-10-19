import { Controller, Get, Query } from "@nestjs/common";
import type { StaffUser } from "../auth/auth-user.type.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { CommunicationLogQueryDto } from "./dtos/communication-log-query.dto.js";
import { CommunicationLogService } from "./communication-log.service.js";

@Roles("TEACHER", "SCHOOL_ADMIN")
@Controller([
  "notifications/communication-log",
  "api/notifications/communication-log",
])
export class CommunicationLogController {
  constructor(private communicationLogService: CommunicationLogService) {}

  @Get()
  getCommunicationLog(
    @CurrentUser() user: StaffUser,
    @Query() query: CommunicationLogQueryDto,
  ) {
    return this.communicationLogService.getCommunicationLog(user, query);
  }
}
