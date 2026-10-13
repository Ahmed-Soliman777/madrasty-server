import { Injectable } from "@nestjs/common";
import { WhatsappService } from "../../auth/whatsapp.service.js";
import type {
  NotificationChannelPort,
  SendResult,
} from "./notification-channel.js";

@Injectable()
export class WhatsappChannel implements NotificationChannelPort {
  readonly kind = "WHATSAPP" as const;

  constructor(private whatsapp: WhatsappService) {}

  isAvailable() {
    return this.whatsapp.isConnected();
  }

  async send(to: string, text: string): Promise<SendResult> {
    const result = await this.whatsapp.sendText(to, text);
    if (result === "sent") return { status: "sent" };
    if (result === "invalid_phone") return { status: "invalid_recipient" };
    if (result === "not_connected") return { status: "unavailable" };
    return { status: "failed", error: "WhatsApp send failed" };
  }
}
