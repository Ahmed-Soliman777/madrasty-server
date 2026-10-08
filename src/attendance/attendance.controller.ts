import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import type { StaffUser } from "../auth/auth-user.type.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { AttendanceService } from "./attendance.service.js";
import {
  BulkRecordsDto,
  OpenSessionDto,
  RecordDto,
} from "./dtos/attendance.dto.js";

@Roles("TEACHER")
@Controller(["attendance-sessions", "api/attendance-sessions"])
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  open(@CurrentUser() user: StaffUser, @Body() dto: OpenSessionDto) {
    return this.attendanceService.openSession(user, dto.timetableEntryId);
  }

  @Put(":id/records")
  setBulk(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BulkRecordsDto,
  ) {
    return this.attendanceService.setRecords(user, id, dto.records);
  }

  @Put(":id/records/:studentId")
  setOne(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("studentId", ParseUUIDPipe) studentId: string,
    @Body() dto: RecordDto,
  ) {
    return this.attendanceService.setRecords(user, id, [{ studentId, ...dto }]);
  }

  @Post(":id/submit")
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentUser() user: StaffUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.attendanceService.submit(user, id);
  }
}
