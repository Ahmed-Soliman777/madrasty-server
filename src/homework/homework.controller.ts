import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { StaffUser } from "../auth/auth-user.type.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import {
  CreateHomeworkDto,
  ListHomeworkQueryDto,
  UpdateHomeworkDto,
} from "./dtos/homework.dto.js";
import { HomeworkService } from "./homework.service.js";

@Roles("TEACHER")
@Controller(["homework", "api/homework"])
export class HomeworkController {
  constructor(private homeworkService: HomeworkService) {}

  @Get("assignments")
  assignments(@CurrentUser() user: StaffUser) {
    return this.homeworkService.myAssignments(user);
  }

  @Post()
  async create(
    @CurrentUser() user: StaffUser,
    @Body() dto: CreateHomeworkDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.homeworkService.create(user, dto);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Get()
  list(@CurrentUser() user: StaffUser, @Query() query: ListHomeworkQueryDto) {
    return this.homeworkService.list(user, query);
  }

  @Get(":id")
  get(@CurrentUser() user: StaffUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.homeworkService.get(user, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateHomeworkDto,
  ) {
    return this.homeworkService.update(user, id, dto);
  }

  @Roles("TEACHER", "SCHOOL_ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.homeworkService.remove(user, id);
  }
}
