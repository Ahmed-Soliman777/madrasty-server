import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { jwtConfigFactory, TokenService } from "./token.service.js";
import { WhatsappService } from "./whatsapp.service.js";

@Module({
  imports: [JwtModule.registerAsync({ useFactory: jwtConfigFactory })],
  controllers: [AuthController],
  providers: [
    AuthService,
    WhatsappService,
    TokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
