import { Module } from "@nestjs/common";
import { WhatsappModule } from "../auth/whatsapp.module.js";
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelPort,
} from "./channels/notification-channel.js";
import { WhatsappChannel } from "./channels/whatsapp.channel.js";
import {
  NOTIFICATIONS_CONFIG,
  notificationsConfigFactory,
} from "./notifications.config.js";
import { NotificationsService } from "./notifications.service.js";
import { NotificationsWorker } from "./notifications.worker.js";
import { CommunicationLogController } from "./communication-log.controller.js";
import { CommunicationLogService } from "./communication-log.service.js";

@Module({
  imports: [WhatsappModule],
  controllers: [CommunicationLogController],
  providers: [
    NotificationsService,
    NotificationsWorker,
    CommunicationLogService,
    WhatsappChannel,
    { provide: NOTIFICATIONS_CONFIG, useFactory: notificationsConfigFactory },
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (whatsapp: WhatsappChannel): NotificationChannelPort[] => [
        whatsapp,
      ],
      inject: [WhatsappChannel],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
