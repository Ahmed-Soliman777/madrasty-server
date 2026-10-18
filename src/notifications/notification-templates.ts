import type { Gender } from "../generated/prisma/enums.js";

export type Locale = "ar" | "en";

const dateTime = (locale: Locale, timeZone: string, date: Date) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

const shorten = (text: string, max = 500) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

interface Named {
  ar: string;
  en: string;
}
const pick = (n: Named, locale: Locale) => (locale === "ar" ? n.ar : n.en);

export interface HomeworkMessageData {
  school: Named;
  timezone: string;
  className: Named;
  subject: Named;
  title: string;
  notes: string | null;
  dueAt: Date;
}

export function renderHomeworkMessage(
  d: HomeworkMessageData,
  locale: Locale,
): string {
  const due = dateTime(locale, d.timezone, d.dueAt);
  const notes = d.notes ? shorten(d.notes) : null;
  if (locale === "ar") {
    return [
      `📚 واجب جديد – ${pick(d.subject, locale)}`,
      pick(d.school, locale),
      "",
      `الفصل: ${pick(d.className, locale)}`,
      `العنوان: ${d.title}`,
      ...(notes ? [`التعليمات: ${notes}`] : []),
      `موعد التسليم: ${due}`,
      "",
      "برجاء متابعة الطالب في حل الواجب. شكراً لتعاونكم.",
    ].join("\n");
  }
  return [
    `📚 New homework – ${pick(d.subject, locale)}`,
    pick(d.school, locale),
    "",
    `Class: ${pick(d.className, locale)}`,
    `Title: ${d.title}`,
    ...(notes ? [`Instructions: ${notes}`] : []),
    `Due: ${due}`,
    "",
    "Please follow up with your child on this homework. Thank you.",
  ].join("\n");
}

const dateOnly = (locale: Locale, date: Date) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);

const periodNumber = (locale: Locale, n: number) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US").format(n);

export interface AbsenceMessageData {
  school: Named;
  student: Named;
  gender: Gender;
  className: Named;
  date: Date;
  lessons: { period: number; subject: Named }[];
}

export function renderAbsenceMessage(
  d: AbsenceMessageData,
  locale: Locale,
): string {
  const date = dateOnly(locale, d.date);
  const list = d.lessons
    .map((l) =>
      locale === "ar"
        ? `الحصة ${periodNumber(locale, l.period)} (${pick(l.subject, locale)})`
        : `Period ${periodNumber(locale, l.period)} (${pick(l.subject, locale)})`,
    )
    .join(locale === "ar" ? "، " : ", ");
  if (locale === "ar") {
    const noun = d.gender === "FEMALE" ? "الطالبة" : "الطالب";
    return [
      `⚠️ تنبيه غياب – ${pick(d.school, locale)}`,
      "",
      `نفيدكم بأن ${noun} ${pick(d.student, locale)} (${pick(d.className, locale)}) تغيّب يوم ${date} عن: ${list}.`,
      "",
      "في حال وجود عذر برجاء التواصل مع إدارة المدرسة.",
    ].join("\n");
  }
  return [
    `⚠️ Absence notice – ${pick(d.school, locale)}`,
    "",
    `Your child ${pick(d.student, locale)} (${pick(d.className, locale)}) was absent on ${date} from: ${list}.`,
    "",
    "If there is an excuse, please contact the school administration.",
  ].join("\n");
}
