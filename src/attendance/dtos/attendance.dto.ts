import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { AttendanceStatus } from "../../generated/prisma/enums.js";

export class OpenSessionDto {
  @IsUUID()
  timetableEntryId: string;
}

export class RecordDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
  @IsOptional()
  @IsISO8601()
  arrivedAt?: string;
}

export class BulkRecordItemDto extends RecordDto {
  @IsUUID()
  studentId: string;
}

export class BulkRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkRecordItemDto)
  records: BulkRecordItemDto[];
}
