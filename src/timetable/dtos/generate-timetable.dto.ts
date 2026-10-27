import { IsUUID } from "class-validator";

export class GenerateTimetableDto {
  @IsUUID()
  academicYearId: string;
}
