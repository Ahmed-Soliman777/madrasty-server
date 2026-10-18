import { createHarness } from "./lib/harness.mjs";
const h = await createHarness(
  [["attendance/attendance.module.js", "AttendanceModule"]],
  "2026-10-11T07:12:00Z",
  { config: { absenceDelayMs: 600_000, maxAttempts: 5 } },
);
const {
  prisma,
  api,
  ok,
  eq,
  expectStatus,
  staffToken,
  at,
  whatsapp,
  notificationsConfig: cfg,
} = h;
const { NotificationsWorker } = await h.load(
  "notifications/notifications.worker.js",
);
const { NotificationsService } = await h.load(
  "notifications/notifications.service.js",
);
const worker = h.get(NotificationsWorker);
const svc = h.get(NotificationsService);
const baseCfg = { ...cfg };

let row;
const NOW = "2026-10-11T07:12:00Z";
const nowMs = new Date(NOW).getTime();
const plus = (ms) => new Date(nowMs + ms).toISOString();
const MIN = 60_000;
const DAY1 = "2026-10-11";

// ───────── fixtures ─────────
const A = await prisma.school.create({
  data: {
    name: "مدارس النيل الدولية",
    nameEn: "Nile International Schools",
    code: "A",
  },
});
const mkG = (phone, n) =>
  prisma.guardian.create({
    data: { phone, fullName: `ولي ${n}`, fullNameEn: `Guardian ${n}` },
  });
const gA = await mkG("+201000000001", "A"),
  gB = await mkG("+201000000002", "B"),
  gC = await mkG("123", "C"),
  gD = await mkG("+201000000004", "D"),
  gE = await mkG("+201000000005", "E");
const mkStaff = (email) =>
  prisma.staff.create({
    data: {
      email,
      password: "x",
      fullName: email,
      fullNameEn: email,
      role: "TEACHER",
      schoolId: A.id,
    },
  });
const t1 = await mkStaff("t1@a"),
  t2 = await mkStaff("t2@a"),
  t3 = await mkStaff("t3@a");
const year = await prisma.academicYear.create({
  data: {
    schoolId: A.id,
    name: "26/27",
    nameEn: "26/27",
    startsOn: new Date("2026-09-20"),
    endsOn: new Date("2027-06-30"),
    isCurrent: true,
  },
});
const mkClass = (n, nEn) =>
  prisma.class.create({
    data: {
      name: n,
      nameEn: nEn,
      grade: "4",
      gradeEn: "4",
      schoolId: A.id,
      academicYearId: year.id,
    },
  });
const c4A = await mkClass("4/أ", "4/A"),
  c2B = await mkClass("2/ب", "2/B");
let nid = 0;
const mkStudent = (c, g, name, nameEn, gender, isActive = true) =>
  prisma.student.create({
    data: {
      nationalId: String(++nid).padStart(14, "0"),
      fullName: name,
      fullNameEn: nameEn,
      gender,
      guardianId: g.id,
      schoolId: A.id,
      classId: c.id,
      isActive,
    },
  });
const s1 = await mkStudent(c4A, gA, "أحمد", "Ahmed", "MALE"),
  s2 = await mkStudent(c4A, gA, "سلمى", "Salma", "FEMALE"),
  s3 = await mkStudent(c4A, gB, "عمر", "Omar", "MALE");
await mkStudent(c4A, gD, "خالد", "Khaled", "MALE", false);
const s5 = await mkStudent(c4A, gC, "ياسر", "Yasser", "MALE"),
  s6 = await mkStudent(c2B, gE, "ليلى", "Laila", "FEMALE");
const subj = (n, nEn) =>
  prisma.subject.create({ data: { schoolId: A.id, name: n, nameEn: nEn } });
const math = await subj("الرياضيات", "Mathematics"),
  sci = await subj("العلوم", "Science"),
  eng = await subj("الإنجليزي", "English");
const period = (number, a, b) =>
  prisma.period.create({
    data: { schoolId: A.id, number, startTime: a, endTime: b },
  });
const p1 = await period(1, "08:00", "08:45"),
  p2 = await period(2, "09:00", "09:45"),
  p3 = await period(3, "10:00", "10:45");
const lesson = async (st, c, sub, p) => {
  const as = await prisma.teacherAssignment.create({
    data: { schoolId: A.id, staffId: st.id, classId: c.id, subjectId: sub.id },
  });
  return prisma.timetableEntry.create({
    data: {
      schoolId: A.id,
      assignmentId: as.id,
      staffId: st.id,
      classId: c.id,
      periodId: p.id,
      weekday: "SUNDAY",
    },
  });
};
const eMath = await lesson(t1, c4A, math, p1),
  eSci = await lesson(t2, c4A, sci, p2),
  eEng = await lesson(t3, c4A, eng, p3),
  e2B = await lesson(t1, c2B, math, p3);
const T1 = staffToken(t1),
  T2 = staffToken(t2),
  T3 = staffToken(t3);
const ACTIVE_4A = [s1, s2, s3, s5];

const rows = (where = {}) =>
  prisma.notification.findMany({ where, orderBy: { createdAt: "asc" } });
const reset = async () => {
  await prisma.notification.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.attendanceSession.deleteMany();
  await prisma.student.update({
    where: { id: s1.id },
    data: { isActive: true },
  });
  whatsapp.sent.length = 0;
  whatsapp.connected = true;
  whatsapp.mode = "sent";
  Object.assign(cfg, baseCfg);
  at(NOW);
};
const submitLesson = async (entry, token, students, absent = []) => {
  const open = await api("post", "/attendance-sessions", token, {
    timetableEntryId: entry.id,
  });
  const sid = open.body.id;
  await api("put", `/attendance-sessions/${sid}/records`, token, {
    records: students.map((s) => ({
      studentId: s.id,
      status: absent.includes(s) ? "ABSENT" : "PRESENT",
    })),
  });
  const sub = await api("post", `/attendance-sessions/${sid}/submit`, token);
  return { sid, status: sub.status, queued: sub.body.queuedNotifications };
};
const textsTo = (phone) =>
  whatsapp.sent.filter((m) => m.phone === phone).map((m) => m.text);
const enqueueAbs = (sessionId, date, students) =>
  prisma.$transaction((tx) =>
    svc.enqueueStudentAbsences(tx, {
      schoolId: A.id,
      sessionId,
      sessionDate: date,
      createdById: t1.id,
      students: students.map((s) => ({ id: s.id, guardianId: s.guardianId })),
    }),
  );

// ═════════ 1. nothing is queued until the session is SUBMITTED ═════════
let r = await expectStatus(
  api("post", "/attendance-sessions", T1, { timetableEntryId: eMath.id }),
  200,
  "open session",
);
const sidMath = r.body.id;
const bulk = (id, recs, t = T1) =>
  api("put", `/attendance-sessions/${id}/records`, t, { records: recs });
await bulk(
  sidMath,
  ACTIVE_4A.map((s) => ({
    studentId: s.id,
    status: s === s1 || s === s2 ? "ABSENT" : "PRESENT",
  })),
);
eq(await prisma.notification.count(), 0, "tapping ABSENT notifies nobody");
await expectStatus(
  api("put", `/attendance-sessions/${sidMath}/records/${s2.id}`, T1, {
    status: "PRESENT",
  }),
  200,
  "teacher fixes a mistake before submitting",
);
eq(await prisma.notification.count(), 0, "still nothing before submit");
r = await expectStatus(
  api("post", `/attendance-sessions/${sidMath}/submit`, T1),
  200,
  "submit",
);
eq(
  r.body.queuedNotifications,
  1,
  "submit queues ONE notification (the corrected student is not included)",
);
let rs = await rows();
const n1 = rs[0];
eq(
  [
    n1.type,
    n1.status,
    n1.channel,
    n1.studentId,
    n1.sessionId,
    n1.homeworkId,
    n1.guardianId,
    n1.createdById,
    n1.attempts,
  ],
  [
    "STUDENT_ABSENT",
    "PENDING",
    "WHATSAPP",
    s1.id,
    sidMath,
    null,
    gA.id,
    t1.id,
    0,
  ],
  "row: right student, session, guardian, creator; PENDING",
);
eq(
  n1.dedupeKey,
  `STUDENT_ABSENT:${s1.id}:${DAY1}`,
  "dedupeKey = student + DAY (not lesson)",
);
eq(
  n1.sendAfter.toISOString(),
  plus(10 * MIN),
  "sendAfter = submit time + 10 minutes",
);
r = await expectStatus(
  api("post", `/attendance-sessions/${sidMath}/submit`, T1),
  200,
  "submit again (idempotent)",
);
eq(
  [r.body.queuedNotifications, await prisma.notification.count()],
  [0, 1],
  "second submit queues nothing",
);

// ═════════ 2. grace window, then ONE message with the right content ═════════
eq(
  (await worker.processDue()).claimed,
  0,
  "inside the 10-minute window: nothing is sent",
);
at(plus(10 * MIN - 1000));
eq(
  (await worker.processDue()).claimed,
  0,
  "1 second before the window ends: still nothing",
);
at(plus(10 * MIN));
let st = await worker.processDue();
eq(
  [st.sent, whatsapp.sent.length, whatsapp.sent[0]?.phone],
  [1, 1, "+201000000001"],
  "after the window: sent once, to the guardian",
);
const text1 = whatsapp.sent[0].text;
for (const part of [
  "الطالب أحمد",
  "(4/أ)",
  "الأحد، ١١ أكتوبر",
  "الحصة ١ (الرياضيات)",
  "مدارس النيل الدولية",
])
  ok(text1.includes(part), `message contains "${part}"`, text1);
row = (await rows())[0];
eq(
  [row.status, row.attempts, row.body === text1],
  ["SENT", 1, true],
  "SENT with the exact text stored",
);
eq((await worker.processDue()).claimed, 0, "never sent twice");

// ═════════ 3. several lessons the same day = ONE message ═════════
await reset();
r = await submitLesson(eMath, T1, ACTIVE_4A, [s1]);
eq(r.queued, 1, "lesson 1 absent -> queued");
at(plus(2 * MIN));
r = await submitLesson(eSci, T2, ACTIVE_4A, [s1]);
eq(
  [r.queued, await prisma.notification.count()],
  [0, 1],
  "lesson 2 absent the same day -> NOT another notification (one per student per day)",
);
st = await worker.processDue();
eq(st.claimed, 0, "lesson 2 does not postpone/duplicate anything");
at(plus(10 * MIN));
st = await worker.processDue();
const batched = textsTo("+201000000001");
eq([st.sent, batched.length], [1, 1], "ONE message for the whole day");
ok(
  batched[0].includes("الحصة ١ (الرياضيات)، الحصة ٢ (العلوم)"),
  "the message lists BOTH lessons, ordered by period",
  batched[0],
);
at(plus(20 * MIN));
r = await submitLesson(eEng, T3, ACTIVE_4A, [s1]);
eq(
  [r.queued, whatsapp.sent.length, await prisma.notification.count()],
  [0, 1, 1],
  "a lesson that finishes AFTER the message went out adds no second message (known limit)",
);

// ═════════ 4. twins, other guardians, invalid phone ═════════
await reset();
r = await submitLesson(eMath, T1, ACTIVE_4A, [s1, s2, s3, s5]);
eq(r.queued, 4, "four absent students -> four notifications (one per student)");
at(plus(10 * MIN));
st = await worker.processDue();
eq(
  [st.claimed, st.sent, st.failed],
  [4, 3, 1],
  "3 sent, 1 failed (invalid phone)",
);
const twin = textsTo("+201000000001");
ok(
  twin.length === 2 &&
    twin.some((t) => t.includes("الطالب أحمد")) &&
    twin.some((t) => t.includes("الطالبة سلمى")),
  "twins: each message is about its own child (boy/girl wording)",
  JSON.stringify(twin),
);
ok(
  textsTo("+201000000002")[0].includes("الطالب عمر"),
  "another guardian gets only their child",
);
const bad = await rows({ studentId: s5.id });
eq(
  [bad[0].status, bad[0].statusReason, bad[0].attempts, bad[0].sentAt],
  ["FAILED", "invalid recipient phone number", 1, null],
  "invalid phone: FAILED immediately, no retries",
);
await reset();
r = await submitLesson(e2B, T1, [s6], [s6]);
at(plus(10 * MIN));
await worker.processDue();
ok(
  textsTo("+201000000005")[0]?.includes("الطالبة ليلى") &&
    textsTo("+201000000005")[0].includes("(2/ب)"),
  "other class: girl wording + her class",
);

// ═════════ 5. corrections, excuses, inactive ═════════
await reset();
const { sid: sidA } = await submitLesson(eMath, T1, ACTIVE_4A, [s1]);
await prisma.attendanceRecord.updateMany({
  where: { sessionId: sidA, studentId: s1.id },
  data: { status: "PRESENT" },
}); // الإدارة صحّحت
at(plus(10 * MIN));
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.cancelled, whatsapp.sent.length, row.status, row.statusReason],
  [1, 0, "CANCELLED", "no unexcused absence is recorded for that day any more"],
  "absence corrected before sending -> CANCELLED, no false message",
);
at(plus(30 * MIN));
r = await submitLesson(eSci, T2, ACTIVE_4A, [s1]);
eq(
  r.queued,
  1,
  "a NEW absence later the same day re-arms the cancelled notification",
);
row = (await rows())[0];
eq(
  [
    await prisma.notification.count(),
    row.status,
    row.attempts,
    row.statusReason,
    row.sendAfter.toISOString(),
  ],
  [1, "PENDING", 0, null, plus(40 * MIN)],
  "re-armed: same row, PENDING, fresh window",
);
at(plus(40 * MIN));
st = await worker.processDue();
const rearmed = whatsapp.sent[0].text;
ok(
  st.sent === 1 &&
    rearmed.includes("الحصة ٢ (العلوم)") &&
    !rearmed.includes("الرياضيات"),
  "re-armed message lists only the still-valid absence (lesson 2)",
  rearmed,
);

await reset();
const first = await submitLesson(eMath, T1, ACTIVE_4A, [s1]);
const second = await submitLesson(eSci, T2, ACTIVE_4A, [s1]);
await prisma.attendanceRecord.updateMany({
  where: { sessionId: first.sid, studentId: s1.id },
  data: { isExcused: true },
});
at(plus(10 * MIN));
await worker.processDue();
ok(
  whatsapp.sent.length === 1 &&
    whatsapp.sent[0].text.includes("الحصة ٢ (العلوم)") &&
    !whatsapp.sent[0].text.includes("الرياضيات"),
  "one lesson excused -> the message mentions only the unexcused one",
  whatsapp.sent[0]?.text,
);
await reset();
const f2 = await submitLesson(eMath, T1, ACTIVE_4A, [s1]);
await prisma.attendanceRecord.updateMany({
  where: { sessionId: f2.sid, studentId: s1.id },
  data: { isExcused: true },
});
at(plus(10 * MIN));
st = await worker.processDue();
eq(
  [st.cancelled, whatsapp.sent.length],
  [1, 0],
  "all absences excused -> CANCELLED, nothing sent",
);
await reset();
await submitLesson(eMath, T1, ACTIVE_4A, [s1]);
await prisma.student.update({
  where: { id: s1.id },
  data: { isActive: false },
});
at(plus(10 * MIN));
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.cancelled, row.statusReason, whatsapp.sent.length],
  [1, "the student is no longer active", 0],
  "student deactivated before sending -> CANCELLED",
);

// ═════════ 6. another day = a new notification; races; failures ═════════
await reset();
const day1 = await submitLesson(eMath, T1, ACTIVE_4A, [s1]);
const day2 = new Date("2026-10-12T00:00:00Z");
const sess2 = await prisma.attendanceSession.create({
  data: {
    schoolId: A.id,
    timetableEntryId: eMath.id,
    date: day2,
    takenById: t1.id,
    status: "SUBMITTED",
    submittedAt: new Date(NOW),
  },
});
await prisma.attendanceRecord.create({
  data: {
    schoolId: A.id,
    sessionId: sess2.id,
    studentId: s1.id,
    status: "ABSENT",
    markedById: t1.id,
  },
});
eq(
  await enqueueAbs(sess2.id, day2, [s1]),
  1,
  "the next day is a new notification",
);
eq(
  (await rows()).map((x) => x.dedupeKey).sort(),
  [`STUDENT_ABSENT:${s1.id}:2026-10-11`, `STUDENT_ABSENT:${s1.id}:2026-10-12`],
  "dedupeKey carries the date",
);
eq(
  await enqueueAbs(sess2.id, day2, [s1]),
  0,
  "enqueueing the same student+day again adds nothing",
);
void day1;

let races = 0,
  raceBad = 0;
for (let i = 0; i < 8; i++) {
  await reset();
  const [a, b] = await Promise.all([
    submitLesson(eMath, T1, ACTIVE_4A, [s1]),
    submitLesson(eSci, T2, ACTIVE_4A, [s1]),
  ]);
  races++;
  if (
    a.status !== 200 ||
    b.status !== 200 ||
    a.queued + b.queued !== 1 ||
    (await prisma.notification.count()) !== 1
  )
    raceBad++;
}
eq(
  [races, raceBad],
  [8, 0],
  "race x8: two teachers submit the same student's absence at once -> exactly one notification, no errors",
);

await reset();
await submitLesson(eMath, T1, ACTIVE_4A, [s1]);
at(plus(10 * MIN));
whatsapp.mode = "failed";
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.retried, row.status, row.attempts, row.sendAfter.toISOString()],
  [1, "PENDING", 1, plus(11 * MIN)],
  "send failure: retried after the 1-minute backoff",
);
at(plus(11 * MIN));
whatsapp.mode = "sent";
st = await worker.processDue();
eq(
  [st.sent, whatsapp.sent.length, (await rows())[0].attempts],
  [1, 1, 2],
  "retry succeeds: sent exactly once",
);

// ═════════ 7. database guards ═════════
await reset();
const sess = await prisma.attendanceSession.create({
  data: {
    schoolId: A.id,
    timetableEntryId: eMath.id,
    date: new Date("2026-10-11"),
    takenById: t1.id,
  },
});
const hw = await prisma.homework.create({
  data: {
    schoolId: A.id,
    assignmentId: (
      await prisma.teacherAssignment.findFirst({
        where: { staffId: t1.id, classId: c4A.id },
      })
    ).id,
    staffId: t1.id,
    classId: c4A.id,
    title: "h",
    dueAt: new Date("2026-10-30T05:00:00Z"),
    createdAt: new Date(NOW),
  },
});
const base = {
  schoolId: A.id,
  guardianId: gA.id,
  createdById: t1.id,
  sendAfter: new Date(NOW),
};
const rejects = async (p) => {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
};
ok(
  await rejects(
    prisma.notification.create({
      data: {
        ...base,
        type: "STUDENT_ABSENT",
        dedupeKey: "g1",
        sessionId: sess.id,
      },
    }),
  ),
  "db: session without student rejected",
);
ok(
  await rejects(
    prisma.notification.create({
      data: {
        ...base,
        type: "STUDENT_ABSENT",
        dedupeKey: "g2",
        studentId: s1.id,
      },
    }),
  ),
  "db: student without session rejected",
);
ok(
  await rejects(
    prisma.notification.create({
      data: {
        ...base,
        type: "STUDENT_ABSENT",
        dedupeKey: "g3",
        studentId: s1.id,
        sessionId: sess.id,
        homeworkId: hw.id,
      },
    }),
  ),
  "db: two sources at once rejected",
);
ok(
  await rejects(
    prisma.notification.create({
      data: { ...base, type: "STUDENT_ABSENT", dedupeKey: "g4" },
    }),
  ),
  "db: no source at all rejected",
);
ok(
  !(await rejects(
    prisma.notification.create({
      data: {
        ...base,
        type: "STUDENT_ABSENT",
        dedupeKey: "g5",
        studentId: s1.id,
        sessionId: sess.id,
      },
    }),
  )),
  "db: a valid absence row is accepted",
);
ok(
  await rejects(prisma.attendanceSession.delete({ where: { id: sess.id } })),
  "db: a session with notifications can't be hard-deleted (history kept)",
);
ok(
  await rejects(prisma.student.delete({ where: { id: s1.id } })),
  "db: a student with notifications can't be hard-deleted",
);

await h.finish();
