import { Module } from "@nestjs/common";
import { TeacherPortalController } from "./teacher-portal.controller.js";
import { TeacherPortalService } from "./teacher-portal.service.js";
import { BehaviorModule } from "../behavior/behavior.module.js";

@Module({
  imports: [BehaviorModule],
  controllers: [TeacherPortalController],
  providers: [TeacherPortalService],
})
export class TeacherPortalModule {}
