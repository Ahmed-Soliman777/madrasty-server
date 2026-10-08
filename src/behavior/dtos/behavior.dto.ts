import { IsOptional, IsUUID } from "class-validator";

export class CreateBehaviorRecordDto {
  @IsUUID()
  studentId: string;

  @IsUUID()
  categoryId: string;
  
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
