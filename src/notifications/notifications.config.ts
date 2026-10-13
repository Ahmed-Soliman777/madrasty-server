export const NOTIFICATIONS_CONFIG = "NOTIFICATIONS_CONFIG";

export interface NotificationsConfig {
  workerEnabled: boolean;
  pollMs: number;
  batchSize: number;
  sendIntervalMs: number;
  sendJitterMs: number;
  maxAttempts: number;
  backoffMs: number[];
  staleLockMs: number;
  maxAgeMs: number;
  unavailableRetryMs: number;
  locale: "ar" | "en";
}

const num = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && process.env[name] !== undefined
    ? value
    : fallback;
};

export const notificationsConfigFactory = (): NotificationsConfig => ({
  workerEnabled: process.env.NOTIFICATIONS_WORKER_ENABLED !== "false",
  pollMs: num("NOTIFICATIONS_POLL_MS", 5_000),
  batchSize: num("NOTIFICATIONS_BATCH_SIZE", 20),
  sendIntervalMs: num("NOTIFICATIONS_SEND_INTERVAL_MS", 1_500),
  sendJitterMs: num("NOTIFICATIONS_SEND_JITTER_MS", 1_000),
  maxAttempts: num("NOTIFICATIONS_MAX_ATTEMPTS", 5),
  backoffMs: [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000],
  staleLockMs: 5 * 60_000,
  maxAgeMs: 24 * 60 * 60_000,
  unavailableRetryMs: 30_000,
  locale: process.env.NOTIFICATIONS_LOCALE === "en" ? "en" : "ar",
});
