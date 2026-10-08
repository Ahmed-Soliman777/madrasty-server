import { Module } from "@nestjs/common";
import { BehaviorController } from "./behavior.controller.js";
import { BehaviorService } from "./behavior.service.js";

@Module({
  controllers: [BehaviorController],
  providers: [BehaviorService],
  exports: [BehaviorService],
})
export class BehaviorModule {}
