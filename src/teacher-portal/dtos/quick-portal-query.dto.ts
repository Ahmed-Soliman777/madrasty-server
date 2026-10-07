import { IsOptional, IsUUID } from "class-validator";

export class QuickPortalQueryDto {
  @IsOptional()
  @IsUUID()
  timetableEntryId?: string;
}
