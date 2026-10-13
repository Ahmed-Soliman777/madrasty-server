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

@Module({
  imports: [WhatsappModule],
  providers: [
    NotificationsService,
    NotificationsWorker,
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
