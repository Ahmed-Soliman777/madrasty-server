import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import type { StaffUser } from "../auth/auth-user.type.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { BehaviorService } from "./behavior.service.js";
import { CreateBehaviorRecordDto } from "./dtos/behavior.dto.js";

@Roles("TEACHER")
@Controller(["behavior-records", "api/behavior-records"])
export class BehaviorController {
  constructor(private behaviorService: BehaviorService) {}

  @Post()
  create(@CurrentUser() user: StaffUser, @Body() dto: CreateBehaviorRecordDto) {
    return this.behaviorService.create(user, dto);
  }

  @Roles("TEACHER", "SCHOOL_ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  void(@CurrentUser() user: StaffUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.behaviorService.void(user, id);
  }
}
