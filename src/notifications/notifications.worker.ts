import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ClockService } from "../common/clock.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { NotificationChannel } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma.service.js";
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelPort,
  type SendResult,
} from "./channels/notification-channel.js";
import {
  NOTIFICATIONS_CONFIG,
  type NotificationsConfig,
} from "./notifications.config.js";
import {
  renderAbsenceMessage,
  renderHomeworkMessage,
} from "./notification-templates.js";

export interface ProcessStats {
  claimed: number;
  sent: number;
  cancelled: number;
  retried: number;
  failed: number;
  released: number;
}

type Prepared =
  | { kind: "send"; to: string; text: string }
  | { kind: "cancel"; reason: string }
  | { kind: "fail"; reason: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class NotificationsWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsWorker.name);
  private readonly channels: Map<NotificationChannel, NotificationChannelPort>;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  private inFlight: Promise<void> | undefined;

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    @Inject(NOTIFICATIONS_CONFIG) private config: NotificationsConfig,
    @Inject(NOTIFICATION_CHANNELS) channels: NotificationChannelPort[],
  ) {
    this.channels = new Map(channels.map((c) => [c.kind, c]));
  }

  onApplicationBootstrap() {
    if (this.config.workerEnabled) this.start();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inFlight;
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.tick();
    }, ms);
    this.timer.unref();
  }

  private async tick() {
    try {
      await this.processDue();
    } catch (error) {
      this.logger.error("Notifications worker tick failed", error);
    } finally {
      this.schedule(this.config.pollMs);
    }
  }

  async processDue(): Promise<ProcessStats> {
    const stats: ProcessStats = {
      claimed: 0,
      sent: 0,
      cancelled: 0,
      retried: 0,
      failed: 0,
      released: 0,
    };
    const now = this.clock.now();

    await this.prisma.notification.updateMany({
      where: {
        status: "SENDING",
        lockedAt: { lt: new Date(now.getTime() - this.config.staleLockMs) },
      },
      data: { status: "PENDING", lockedAt: null, sendAfter: now },
    });

    const due = await this.prisma.notification.findMany({
      where: { status: "PENDING", sendAfter: { lte: now } },
      orderBy: [{ sendAfter: "asc" }, { createdAt: "asc" }],
      take: this.config.batchSize,
      select: { id: true, channel: true },
    });

    let first = true;
    for (const candidate of due) {
      const channel = this.channels.get(candidate.channel);
      if (!channel?.isAvailable()) continue;

      const claim = await this.prisma.notification.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: { status: "SENDING", lockedAt: now, attempts: { increment: 1 } },
      });
      if (claim.count !== 1) continue;
      stats.claimed++;

      if (!first) await this.pause();
      first = false;
      await this.deliver(candidate.id, channel, stats);
    }
    return stats;
  }

  private async pause() {
    const { sendIntervalMs, sendJitterMs } = this.config;
    if (sendIntervalMs + sendJitterMs > 0)
      await sleep(sendIntervalMs + Math.random() * sendJitterMs);
  }

  private async deliver(
    id: string,
    channel: NotificationChannelPort,
    stats: ProcessStats,
  ) {
    const n = await this.prisma.notification.findUniqueOrThrow({
      where: { id },
      select: {
        type: true,
        attempts: true,
        createdAt: true,
        homeworkId: true,
        studentId: true,
        sessionId: true,
        guardian: { select: { phone: true } },
        school: { select: { name: true, nameEn: true, timezone: true } },
      },
    });

    if (
      this.clock.now().getTime() - n.createdAt.getTime() >
      this.config.maxAgeMs
    ) {
      await this.finish(id, { status: "FAILED", statusReason: "expired" });
      stats.failed++;
      return;
    }

    let prepared: Prepared;
    try {
      prepared = await this.prepare(n);
    } catch (error) {
      await this.retryLater(
        id,
        n.attempts,
        `prepare failed: ${String(error)}`,
        stats,
      );
      return;
    }
    if (prepared.kind === "cancel") {
      await this.finish(id, {
        status: "CANCELLED",
        statusReason: prepared.reason,
      });
      stats.cancelled++;
      return;
    }
    if (prepared.kind === "fail") {
      await this.finish(id, {
        status: "FAILED",
        statusReason: prepared.reason,
      });
      stats.failed++;
      return;
    }

    let result: SendResult;
    try {
      result = await channel.send(prepared.to, prepared.text);
    } catch (error) {
      result = { status: "failed", error: String(error) };
    }

    if (result.status === "sent") {
      await this.finish(id, {
        status: "SENT",
        sentAt: this.clock.now(),
        body: prepared.text,
        statusReason: null,
      });
      stats.sent++;
    } else if (result.status === "invalid_recipient") {
      await this.finish(id, {
        status: "FAILED",
        statusReason: "invalid recipient phone number",
      });
      stats.failed++;
    } else if (result.status === "unavailable") {
      await this.prisma.notification.updateMany({
        where: { id, status: "SENDING" },
        data: {
          status: "PENDING",
          lockedAt: null,
          attempts: { decrement: 1 },
          sendAfter: new Date(
            this.clock.now().getTime() + this.config.unavailableRetryMs,
          ),
        },
      });
      stats.released++;
    } else {
      await this.retryLater(id, n.attempts, result.error, stats);
    }
  }

  private async prepareHomework(n: {
    homeworkId: string | null;
    guardian: { phone: string };
    school: { name: string; nameEn: string; timezone: string };
  }): Promise<Prepared> {
    const hw = await this.prisma.homework.findUnique({
      where: { id: n.homeworkId! },
      select: {
        title: true,
        notes: true,
        dueAt: true,
        deletedAt: true,
        assignment: {
          select: {
            class: { select: { name: true, nameEn: true } },
            subject: { select: { name: true, nameEn: true } },
          },
        },
      },
    });
    if (!hw || hw.deletedAt)
      return { kind: "cancel", reason: "homework was deleted" };
    if (hw.dueAt.getTime() <= this.clock.now().getTime()) {
      return { kind: "cancel", reason: "homework is already past due" };
    }
    return {
      kind: "send",
      to: n.guardian.phone,
      text: renderHomeworkMessage(
        {
          school: { ar: n.school.name, en: n.school.nameEn },
          timezone: n.school.timezone,
          className: {
            ar: hw.assignment.class.name,
            en: hw.assignment.class.nameEn,
          },
          subject: {
            ar: hw.assignment.subject.name,
            en: hw.assignment.subject.nameEn,
          },
          title: hw.title,
          notes: hw.notes,
          dueAt: hw.dueAt,
        },
        this.config.locale,
      ),
    };
  }

  private async prepare(n: {
    type: "HOMEWORK_ASSIGNED" | "STUDENT_ABSENT";
    homeworkId: string | null;
    studentId: string | null;
    sessionId: string | null;
    guardian: { phone: string };
    school: { name: string; nameEn: string; timezone: string };
  }): Promise<Prepared> {
    return n.type === "HOMEWORK_ASSIGNED"
      ? this.prepareHomework(n)
      : this.prepareAbsence(n);
  }

  private async prepareAbsence(n: {
    studentId: string | null;
    sessionId: string | null;
    guardian: { phone: string };
    school: { name: string; nameEn: string };
  }): Promise<Prepared> {
    const trigger = await this.prisma.attendanceSession.findUnique({
      where: { id: n.sessionId! },
      select: { date: true },
    });
    const student = await this.prisma.student.findUnique({
      where: { id: n.studentId! },
      select: {
        fullName: true,
        fullNameEn: true,
        gender: true,
        isActive: true,
        class: { select: { name: true, nameEn: true } },
      },
    });
    if (!trigger || !student)
      return {
        kind: "cancel",
        reason: "the attendance record no longer exists",
      };
    if (!student.isActive)
      return { kind: "cancel", reason: "the student is no longer active" };

    const absences = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId: n.studentId!,
        status: "ABSENT",
        isExcused: false,
        session: { date: trigger.date, status: "SUBMITTED" },
      },
      select: {
        session: {
          select: {
            timetableEntry: {
              select: {
                period: { select: { number: true } },
                assignment: {
                  select: { subject: { select: { name: true, nameEn: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (absences.length === 0) {
      return {
        kind: "cancel",
        reason: "no unexcused absence is recorded for that day any more",
      };
    }
    const lessons = absences
      .map((a) => ({
        period: a.session.timetableEntry.period.number,
        subject: {
          ar: a.session.timetableEntry.assignment.subject.name,
          en: a.session.timetableEntry.assignment.subject.nameEn,
        },
      }))
      .sort((x, y) => x.period - y.period);
    return {
      kind: "send",
      to: n.guardian.phone,
      text: renderAbsenceMessage(
        {
          school: { ar: n.school.name, en: n.school.nameEn },
          student: { ar: student.fullName, en: student.fullNameEn },
          gender: student.gender,
          className: { ar: student.class.name, en: student.class.nameEn },
          date: trigger.date,
          lessons,
        },
        this.config.locale,
      ),
    };
  }

  private async retryLater(
    id: string,
    attempts: number,
    error: string,
    stats: ProcessStats,
  ) {
    if (attempts >= this.config.maxAttempts) {
      await this.finish(id, {
        status: "FAILED",
        statusReason: error.slice(0, 500),
      });
      stats.failed++;
      return;
    }
    const backoff =
      this.config.backoffMs[
        Math.min(attempts - 1, this.config.backoffMs.length - 1)
      ] ?? 60_000;
    await this.prisma.notification.updateMany({
      where: { id, status: "SENDING" },
      data: {
        status: "PENDING",
        lockedAt: null,
        statusReason: error.slice(0, 500),
        sendAfter: new Date(this.clock.now().getTime() + backoff),
      },
    });
    stats.retried++;
  }

  private async finish(
    id: string,
    data: Prisma.NotificationUpdateManyMutationInput,
  ) {
    await this.prisma.notification.updateMany({
      where: { id, status: "SENDING" },
      data: { lockedAt: null, ...data },
    });
  }
}
