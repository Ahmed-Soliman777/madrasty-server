import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

export function normalizeEgyptianPhone(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0")) {
    digits = `20${digits.slice(1)}`;
  } else if (digits.startsWith("1") && digits.length === 10) {
    digits = `20${digits}`;
  }

  return /^201\d{9}$/.test(digits) ? digits : null;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private socket: WASocket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private connected = false;
  private shuttingDown = false;

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.end(new Error("Application is shutting down"));
  }

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const internationalPhone = normalizeEgyptianPhone(phone);
    if (!internationalPhone || !this.socket || !this.connected) {
      this.logger.warn(
        "WhatsApp is not connected or the phone number is invalid",
      );
      return false;
    }

    try {
      await this.socket.sendMessage(`${internationalPhone}@s.whatsapp.net`, {
        text: `Your Madrasaty verification code is ${otp}. It expires in 5 minutes.`,
      });
      return true;
    } catch (error) {
      this.logger.error("Failed to send the WhatsApp verification code", error);
      return false;
    }
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown) return;

    try {
      const { state, saveCreds } =
        await useMultiFileAuthState("baileys_auth_info");
      const socket = makeWASocket({ auth: state, markOnlineOnConnect: false });
      this.socket = socket;

      socket.ev.on("creds.update", () => {
        void saveCreds().catch((error: unknown) => {
          this.logger.error("Failed to save WhatsApp credentials", error);
        });
      });
      socket.ev.on("connection.update", (update) => {
        if (update.qr) {
          this.logger.log(
            "Scan this WhatsApp QR code from the linked devices screen:",
          );
          const terminalQr = qrcode as unknown as {
            generate: (code: string, options: { small: boolean }) => void;
          };
          terminalQr.generate(update.qr, { small: true });
        }

        if (update.connection === "open") {
          this.connected = true;
          this.logger.log("WhatsApp connection is ready");
        }

        if (update.connection === "close") {
          this.connected = false;
          this.socket = undefined;
          const statusCode = (
            update.lastDisconnect?.error as
              { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;

          if (!this.shuttingDown && statusCode !== DisconnectReason.loggedOut) {
            this.reconnectTimer = setTimeout(() => void this.connect(), 3000);
          } else if (statusCode === DisconnectReason.loggedOut) {
            this.logger.error(
              "WhatsApp logged out. Remove baileys_auth_info and restart to pair again.",
            );
          }
        }
      });
    } catch (error) {
      this.logger.error("Could not initialize the WhatsApp connection", error);
      if (!this.shuttingDown) {
        this.reconnectTimer = setTimeout(() => void this.connect(), 3000);
      }
    }
  }
}
