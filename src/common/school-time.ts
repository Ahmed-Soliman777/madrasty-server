import type { Weekday } from "../generated/prisma/enums.js";

export interface SchoolNow {
  dateStr: string;
  date: Date;
  weekday: Weekday;
  time: string;
}

export function schoolNow(timezone: string, now: Date): SchoolNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    dateStr,
    date: new Date(`${dateStr}T00:00:00.000Z`),
    weekday: get("weekday").toUpperCase() as Weekday,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export type LessonState = "CURRENT" | "UPCOMING" | "PAST";

export function lessonState(
  period: { startTime: string; endTime: string },
  time: string,
): LessonState {
  if (time < period.startTime) return "UPCOMING";
  if (time >= period.endTime) return "PAST";
  return "CURRENT";
}
