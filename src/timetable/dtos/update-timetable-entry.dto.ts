import { IsEnum, IsUUID } from "class-validator";
import { Weekday } from "../../generated/prisma/enums.js";

export class UpdateTimetableEntryDto {
  @IsUUID()
  periodId: string;

  @IsEnum(Weekday)
  weekday: Weekday;
}
