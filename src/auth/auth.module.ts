import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { WhatsappService } from "./whatsapp.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, WhatsappService],
})
export class AuthModule {}
