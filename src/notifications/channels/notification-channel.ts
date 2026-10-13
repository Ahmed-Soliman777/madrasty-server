import type { NotificationChannel } from "../../generated/prisma/enums.js";

export type SendResult =
  | { status: "sent" }
  | { status: "invalid_recipient" }
  | { status: "unavailable" }
  | { status: "failed"; error: string };

export interface NotificationChannelPort {
  readonly kind: NotificationChannel;
  isAvailable(): boolean;
  send(to: string, text: string): Promise<SendResult>;
}

export const NOTIFICATION_CHANNELS = "NOTIFICATION_CHANNELS";
