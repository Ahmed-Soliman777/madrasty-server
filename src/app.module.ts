import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { PrismaModule } from "./prisma.module.js";
import { CommonModule } from "./common/common.module.js";
import { AttendanceModule } from "./attendance/attendance.module.js";
import { TeacherPortalModule } from "./teacher-portal/teacher-portal.module.js";
import { BehaviorModule } from "./behavior/behavior.module.js";
import { HomeworkModule } from "./homework/homework.module.js";

@Module({
  imports: [
    CommonModule,
    AuthModule,
    PrismaModule,
    AttendanceModule,
    TeacherPortalModule,
    BehaviorModule,
    HomeworkModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
