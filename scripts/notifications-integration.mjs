import { createHarness } from "./lib/harness.mjs";

const h = await createHarness(
  [
    ["homework/homework.module.js", "HomeworkModule"],
    ["attendance/attendance.module.js", "AttendanceModule"],
  ],
  "2026-10-11T07:12:00Z",
  { config: { maxAttempts: 5 } },
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

const NOW = "2026-10-11T07:12:00Z"; 
const nowMs = new Date(NOW).getTime();
const plus = (ms) => new Date(nowMs + ms).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DUE = "2026-10-12T05:00:00.000Z"; 

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
  t2 = await mkStaff("t2@a");
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
  c2B = await mkClass("2/ب", "2/B"),
  c5 = await mkClass("5/ج", "5/C");
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
const s4 = await mkStudent(c4A, gD, "خالد", "Khaled", "MALE", false),
  s5 = await mkStudent(c4A, gC, "ياسر", "Yasser", "MALE"),
  s6 = await mkStudent(c2B, gE, "ليلى", "Laila", "FEMALE");
for (let i = 1; i <= 20; i++)
  await mkStudent(
    c5,
    await mkG(`+201${200000000 + i}`, `K${i}`),
    `طالب ${i}`,
    `Kid ${i}`,
    "MALE",
  );
const math = await prisma.subject.create({
  data: { schoolId: A.id, name: "الرياضيات", nameEn: "Mathematics" },
});
const sci = await prisma.subject.create({
  data: { schoolId: A.id, name: "العلوم", nameEn: "Science" },
});
const p3 = await prisma.period.create({
  data: { schoolId: A.id, number: 3, startTime: "10:00", endTime: "10:45" },
});
const p4 = await prisma.period.create({
  data: { schoolId: A.id, number: 4, startTime: "11:00", endTime: "11:45" },
});
const assign = (st, c, sub) =>
  prisma.teacherAssignment.create({
    data: { schoolId: A.id, staffId: st.id, classId: c.id, subjectId: sub.id },
  });
const as1 = await assign(t1, c4A, math),
  as2 = await assign(t1, c2B, math),
  as5 = await assign(t1, c5, math);
const T1 = staffToken(t1);

const body = (o = {}) => ({
  assignmentId: as1.id,
  title: "تمارين صفحة 45",
  notes: "حل الأسئلة",
  dueAt: DUE,
  ...o,
});
const postHw = (b, t = T1) => api("post", "/homework", t, b);
const rows = (where = {}) =>
  prisma.notification.findMany({ where, orderBy: { createdAt: "asc" } });
const reset = async () => {
  await prisma.notification.deleteMany();
  whatsapp.sent.length = 0;
  whatsapp.connected = true;
  whatsapp.mode = "sent";
  Object.assign(cfg, baseCfg);
  at(NOW);
};
const enqueueHw = (hwId, classId) =>
  prisma.$transaction((tx) =>
    svc.enqueueHomeworkAssigned(tx, {
      schoolId: A.id,
      homeworkId: hwId,
      classId,
      createdById: t1.id,
    }),
  );

// ═════════ 1. homework → outbox (inside the homework transaction) ═════════
let r = await expectStatus(postHw(body()), 201, "homework: create -> 201");
const hw1 = r.body.homework;
eq(
  r.body.queuedNotifications,
  3,
  "homework: one notification per GUARDIAN of an active student (twins share one; inactive student's guardian excluded)",
);
let rs = await rows({ homeworkId: hw1.id });
eq(
  rs.map((x) => x.guardianId).sort(),
  [gA.id, gB.id, gC.id].sort(),
  "homework: recipients = gA (twins), gB, gC",
);
ok(
  rs.every(
    (x) =>
      x.type === "HOMEWORK_ASSIGNED" &&
      x.status === "PENDING" &&
      x.channel === "WHATSAPP" &&
      x.createdById === t1.id &&
      x.attempts === 0 &&
      x.sentAt === null,
  ),
  "homework: rows are PENDING, WHATSAPP, created by the teacher, nothing sent yet",
);
eq(
  rs.map((x) => x.dedupeKey).sort(),
  [gA.id, gB.id, gC.id].map((g) => `HOMEWORK_ASSIGNED:${hw1.id}:${g}`).sort(),
  "homework: dedupeKey = type:homework:guardian",
);
eq(
  rs[0].sendAfter.toISOString(),
  plus(0),
  "homework: sendAfter = now (immediate)",
);
r = await expectStatus(
  postHw(body()),
  200,
  "homework: same homework again -> 200",
);
eq(
  [
    r.body.created,
    r.body.queuedNotifications,
    await prisma.notification.count(),
  ],
  [false, 0, 3],
  "homework: retry creates no extra notifications",
);
r = await expectStatus(
  postHw(body({ title: "no-notify", notifyGuardians: false })),
  201,
  "homework: notifyGuardians=false -> 201",
);
eq(
  [r.body.queuedNotifications, await prisma.notification.count()],
  [0, 3],
  "homework: nothing queued when the teacher opts out",
);
await expectStatus(
  postHw(body({ title: "bad", notifyGuardians: "yes" })),
  400,
  "homework: notifyGuardians must be a boolean -> 400",
);
r = await postHw(body({ assignmentId: as2.id, title: "2B hw" }));
eq(
  [
    r.body.queuedNotifications,
    (await rows({ homeworkId: r.body.homework.id }))[0].guardianId,
  ],
  [1, gE.id],
  "homework: another class only notifies its own guardians",
);
const original = svc.enqueueHomeworkAssigned;
svc.enqueueHomeworkAssigned = async () => {
  throw new Error("boom");
};
r = await postHw(body({ title: "ATOMIC" }));
svc.enqueueHomeworkAssigned = original;
eq(
  [r.status, await prisma.homework.count({ where: { title: "ATOMIC" } })],
  [500, 0],
  "homework: if queueing fails the homework is NOT saved either (one transaction)",
);
const race = await Promise.all(
  Array.from({ length: 12 }, () => postHw(body({ title: "RACE" }))),
);
eq(
  race.filter((x) => x.status === 201).length,
  1,
  "homework race: 12 parallel identical creates -> one 201",
);
eq(
  await prisma.notification.count({ where: { homework: { title: "RACE" } } }),
  3,
  "homework race: 3 notifications, not 36",
);
eq(
  await enqueueHw(hw1.id, c4A.id),
  0,
  "homework: enqueueing the same homework twice adds nothing (dedupeKey)",
);

// ═════════ 3. worker: delivery ═════════
await reset();
r = await postHw(body({ title: "تمارين صفحة 45 (واجب أول)" }));
const hwW1 = r.body.homework;
let st = await worker.processDue();
eq(
  [st.claimed, st.sent, st.failed, st.cancelled, st.retried],
  [3, 2, 1, 0, 0],
  "worker: 2 sent, 1 failed (invalid phone), none retried",
);
eq(
  whatsapp.sent.map((m) => m.phone).sort(),
  ["+201000000001", "+201000000002"],
  "worker: sent to the two valid guardians only (twins -> ONE message)",
);
const hwText = whatsapp.sent[0].text;
for (const part of [
  "تمارين صفحة 45",
  "الرياضيات",
  "4/أ",
  "حل الأسئلة",
  "مدارس النيل الدولية",
  "الاثنين",
  "١٢",
  "٨:٠٠",
])
  ok(
    hwText.includes(part),
    `worker: homework text contains "${part}" (due time is Cairo time)`,
    hwText,
  );
rs = await rows({ homeworkId: hwW1.id });
const sentRows = rs.filter((x) => x.status === "SENT");
ok(
  sentRows.length === 2 &&
    sentRows.every(
      (x) =>
        x.sentAt.toISOString() === plus(0) &&
        x.attempts === 1 &&
        x.lockedAt === null &&
        x.body ===
          whatsapp.sent.find(
            (m) =>
              m.phone ===
              { [gA.id]: "+201000000001", [gB.id]: "+201000000002" }[
                x.guardianId
              ],
          ).text,
    ),
  "worker: SENT rows keep sentAt, attempts=1 and the exact text that was sent",
);
const failedRow = rs.find((x) => x.status === "FAILED");
eq(
  [
    failedRow.guardianId,
    failedRow.statusReason,
    failedRow.attempts,
    failedRow.sentAt,
  ],
  [gC.id, "invalid recipient phone number", 1, null],
  "worker: invalid phone -> FAILED immediately, no retries",
);
st = await worker.processDue();
eq(
  [st.claimed, whatsapp.sent.length],
  [0, 2],
  "worker: running again sends nothing twice",
);

await reset();
r = await postHw(body({ title: "OLD TITLE", notes: "old notes" }));
await api("patch", `/homework/${r.body.homework.id}`, T1, {
  title: "NEW TITLE",
  notes: "new notes",
});
await worker.processDue();
ok(
  whatsapp.sent.length === 2 &&
    whatsapp.sent.every(
      (m) =>
        m.text.includes("NEW TITLE") &&
        m.text.includes("new notes") &&
        !m.text.includes("OLD TITLE"),
    ),
  "worker: message reflects the homework as edited before sending",
);

await reset();
r = await postHw(body({ title: "WILL BE DELETED" }));
await api("delete", `/homework/${r.body.homework.id}`, T1);
st = await worker.processDue();
eq(
  [st.cancelled, st.sent, whatsapp.sent.length],
  [3, 0, 0],
  "worker: deleted homework -> all 3 CANCELLED, nothing sent",
);
eq(
  [...new Set((await rows()).map((x) => x.statusReason))],
  ["homework was deleted"],
  "worker: cancel reason recorded",
);

await reset();
await postHw(body({ title: "TOO LATE" }));
at("2026-10-12T06:00:00Z"); // بعد ميعاد التسليم
st = await worker.processDue();
eq(
  [st.cancelled, whatsapp.sent.length, (await rows())[0].statusReason],
  [3, 0, "homework is already past due"],
  "worker: homework already past due when its turn comes -> CANCELLED, not sent",
);

// ═════════ 4. worker: channel down, failures, recovery ═════════
await reset();
await postHw(body({ assignmentId: as2.id, title: "W6" })); // 1 notification (gE)
whatsapp.connected = false;
st = await worker.processDue();
eq(
  [st.claimed, (await rows())[0].status, (await rows())[0].attempts],
  [0, "PENDING", 0],
  "channel down: nothing claimed, no attempts burned",
);
whatsapp.connected = true;
whatsapp.mode = "not_connected";
st = await worker.processDue();
let row = (await rows())[0];
eq(
  [st.released, row.status, row.attempts, row.sendAfter.toISOString()],
  [1, "PENDING", 0, plus(30_000)],
  "channel drops mid-send: released WITHOUT using an attempt, retried in 30s",
);
eq(
  (await worker.processDue()).claimed,
  0,
  "channel drops mid-send: not retried before its time",
);
at(plus(31_000));
whatsapp.mode = "sent";
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.sent, row.status, row.attempts],
  [1, "SENT", 1],
  "channel back: delivered on the first real attempt",
);

await reset();
Object.assign(cfg, { maxAttempts: 3, backoffMs: [60_000, 300_000] });
await postHw(body({ assignmentId: as2.id, title: "W7" }));
whatsapp.mode = "failed";
st = await worker.processDue();
row = (await rows())[0];
eq(
  [
    st.retried,
    row.status,
    row.attempts,
    row.sendAfter.toISOString(),
    !!row.statusReason,
  ],
  [1, "PENDING", 1, plus(60_000), true],
  "failure 1: back to PENDING, +60s, reason kept",
);
eq(
  (await worker.processDue()).claimed,
  0,
  "failure 1: not retried before the backoff passes",
);
at(plus(61_000));
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.retried, row.attempts, row.sendAfter.toISOString()],
  [1, 2, plus(61_000 + 300_000)],
  "failure 2: +5 minutes",
);
at(plus(61_000 + 301_000));
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.failed, row.status, row.attempts, whatsapp.sent.length],
  [1, "FAILED", 3, 0],
  "failure 3 (= maxAttempts): FAILED for good, never sent",
);
await reset();
await postHw(body({ assignmentId: as2.id, title: "W7b" }));
let calls = 0;
whatsapp.mode = () => (calls++ === 0 ? "failed" : "sent");
await worker.processDue();
at(plus(61_000));
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.sent, row.status, row.attempts, whatsapp.sent.length],
  [1, "SENT", 2, 1],
  "transient failure: succeeds on the retry, sent exactly once",
);

await reset();
await postHw(body({ assignmentId: as2.id, title: "W8" }));
await postHw(body({ assignmentId: as2.id, title: "W8b" }));
const [stale, fresh] = await rows();
await prisma.notification.update({
  where: { id: stale.id },
  data: {
    status: "SENDING",
    lockedAt: new Date(nowMs - 10 * 60_000),
    attempts: 1,
  },
});
await prisma.notification.update({
  where: { id: fresh.id },
  data: { status: "SENDING", lockedAt: new Date(nowMs - 60_000), attempts: 1 },
});
st = await worker.processDue();
const [staleAfter, freshAfter] = await Promise.all([
  prisma.notification.findUnique({ where: { id: stale.id } }),
  prisma.notification.findUnique({ where: { id: fresh.id } }),
]);
eq(
  [
    staleAfter.status,
    staleAfter.attempts,
    freshAfter.status,
    whatsapp.sent.length,
  ],
  ["SENT", 2, "SENDING", 1],
  "crash recovery: an abandoned SENDING row is reclaimed and sent; a fresh one is left alone",
);

await reset();
await postHw(
  body({
    assignmentId: as2.id,
    title: "W9",
    dueAt: "2026-11-05T05:00:00.000Z",
  }),
);
at(plus(25 * 3_600_000));
st = await worker.processDue();
row = (await rows())[0];
eq(
  [st.failed, row.status, row.statusReason, whatsapp.sent.length],
  [1, "FAILED", "expired", 0],
  "a notification older than 24h is dropped (stale news), not sent",
);

// ═════════ 5. concurrency, loop, throttle ═════════
await reset();
r = await postHw(body({ assignmentId: as5.id, title: "BIG" }));
eq(r.body.queuedNotifications, 20, "big class: 20 notifications");
const stats = await Promise.all([1, 2, 3, 4].map(() => worker.processDue()));
eq(
  [
    stats.reduce((a, s) => a + s.claimed, 0),
    stats.reduce((a, s) => a + s.sent, 0),
    whatsapp.sent.length,
    new Set(whatsapp.sent.map((m) => m.phone)).size,
  ],
  [20, 20, 20, 20],
  "4 workers at once: every notification claimed and sent EXACTLY once",
);
ok(
  (await rows()).every((x) => x.status === "SENT" && x.attempts === 1),
  "4 workers at once: all SENT with attempts=1",
);

await reset();
cfg.pollMs = 40;
await postHw(body({ assignmentId: as2.id, title: "LOOP" }));
worker.start();
worker.start();
let waited = 0;
while (waited < 3000 && (await rows())[0].status !== "SENT") {
  await sleep(50);
  waited += 50;
}
await worker.stop();
eq(
  [(await rows())[0].status, whatsapp.sent.length],
  ["SENT", 1],
  `background loop picked it up by itself (${waited}ms), start() twice is harmless`,
);
await postHw(body({ assignmentId: as2.id, title: "AFTER STOP" }));
await sleep(200);
eq(whatsapp.sent.length, 1, "after stop() the loop sends nothing");

await reset();
await postHw(body({ assignmentId: as5.id, title: "THROTTLE" }));
cfg.sendIntervalMs = 30;
const t0 = Date.now();
await worker.processDue();
const elapsed = Date.now() - t0;
ok(
  whatsapp.sent.length === 20 && elapsed >= 19 * 30 * 0.9,
  `throttle: 20 messages spaced by sendIntervalMs (took ${elapsed}ms, >= ~570ms)`,
);

// ═════════ 6. database guards (independent of the code) ═════════
await reset();
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
      data: { ...base, type: "HOMEWORK_ASSIGNED", dedupeKey: "x1" },
    }),
  ),
  "db: homework notification without homeworkId rejected",
);
ok(
  await rejects(
    prisma.notification.create({
      data: {
        ...base,
        type: "HOMEWORK_ASSIGNED",
        dedupeKey: "x2",
        homeworkId: hw1.id,
        status: "SENT",
      },
    }),
  ),
  "db: SENT without sentAt/body rejected",
);
ok(
  await rejects(
    prisma.notification.create({
      data: {
        ...base,
        type: "HOMEWORK_ASSIGNED",
        dedupeKey: "x3",
        homeworkId: hw1.id,
        attempts: -1,
      },
    }),
  ),
  "db: negative attempts rejected",
);
await prisma.notification.create({
  data: {
    ...base,
    type: "HOMEWORK_ASSIGNED",
    dedupeKey: "dup",
    homeworkId: hw1.id,
  },
});
ok(
  await rejects(
    prisma.notification.create({
      data: {
        ...base,
        type: "HOMEWORK_ASSIGNED",
        dedupeKey: "dup",
        homeworkId: hw1.id,
      },
    }),
  ),
  "db: duplicate dedupeKey rejected",
);
ok(
  await rejects(prisma.homework.delete({ where: { id: hw1.id } })),
  "db: homework with notifications can't be hard-deleted (history is kept)",
);
const other = await prisma.guardian.create({
  data: { phone: "+201999999999", fullName: "x", fullNameEn: "x" },
});
ok(
  await rejects(prisma.guardian.delete({ where: { id: gA.id } })),
  "db: a guardian with notifications can't be hard-deleted",
);
void other;

await h.finish();
