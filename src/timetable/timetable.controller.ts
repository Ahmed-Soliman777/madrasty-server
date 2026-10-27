import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { GuardianUser, StaffUser } from "../auth/auth-user.type.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { GenerateTimetableDto } from "./dtos/generate-timetable.dto.js";
import { UpdateTimetableEntryDto } from "./dtos/update-timetable-entry.dto.js";
import { TimetableService } from "./timetable.service.js";

@Controller(["timetables", "api/timetables"])
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get()
  @Roles("SCHOOL_ADMIN")
  list(
    @CurrentUser() user: StaffUser,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.timetableService.listSchoolTimetables(user, academicYearId);
  }

  @Post("generate")
  @Roles("SCHOOL_ADMIN")
  generate(@CurrentUser() user: StaffUser, @Body() dto: GenerateTimetableDto) {
    return this.timetableService.generateDraft(user, dto.academicYearId);
  }

  @Get("teacher/me")
  @Roles("TEACHER")
  teacherTimetable(
    @CurrentUser() user: StaffUser,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.timetableService.getTeacherTimetable(user, academicYearId);
  }

  @Get("guardian/student/:studentId")
  @Roles("guardian")
  guardianStudentTimetable(
    @CurrentUser() user: GuardianUser,
    @Param("studentId", ParseUUIDPipe) studentId: string,
  ) {
    return this.timetableService.getGuardianStudentTimetable(user, studentId);
  }

  @Get(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  getOne(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.timetableService.getTimetable(user, id);
  }

  @Patch(":id/entries/:entryId")
  @Roles("SCHOOL_ADMIN")
  updateEntry(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("entryId", ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateTimetableEntryDto,
  ) {
    return this.timetableService.updateEntry(user, id, entryId, dto.periodId, dto.weekday);
  }

  @Post(":id/publish")
  @Roles("SCHOOL_ADMIN")
  publish(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.timetableService.publish(user, id);
  }

  @Delete(":id")
  @Roles("SCHOOL_ADMIN")
  deleteDraft(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.timetableService.deleteDraft(user, id);
  }
}
