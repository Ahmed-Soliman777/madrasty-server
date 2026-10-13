import { Module } from "@nestjs/common";
import { HomeworkController } from "./homework.controller.js";
import { HomeworkService } from "./homework.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";

@Module({
  imports: [NotificationsModule],
  controllers: [HomeworkController],
  providers: [HomeworkService],
})
export class HomeworkModule {}
