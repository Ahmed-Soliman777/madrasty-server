import "reflect-metadata";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Test } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import request from "supertest";
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: DATABASE_URL must point to a database whose name ends with "_test" (got "${dbName}")`);
  process.exit(1);
}
const D = pathToFileURL(resolve(process.env.DIST ?? "dist/src")).href;
const { TokenService, jwtConfigFactory } = await import(`${D}/auth/token.service.js`);
const { AuthGuard } = await import(`${D}/auth/guards/auth.guard.js`);
const { RolesGuard } = await import(`${D}/auth/guards/roles.guard.js`);
const { PrismaModule } = await import(`${D}/prisma.module.js`);
const { PrismaService } = await import(`${D}/prisma.service.js`);
const { CommonModule } = await import(`${D}/common/common.module.js`);
const { ClockService } = await import(`${D}/common/clock.service.js`);
const { WhatsappService } = await import(`${D}/auth/whatsapp.service.js`);
const { NOTIFICATIONS_CONFIG, notificationsConfigFactory } = await import(`${D}/notifications/notifications.config.js`);
const whatsappStub = { onModuleInit() {}, onModuleDestroy() {}, isConnected: () => true, sendOtp: async () => true, sendText: async () => "sent" };
const { AttendanceModule } = await import(`${D}/attendance/attendance.module.js`);
const { TeacherPortalModule } = await import(`${D}/teacher-portal/teacher-portal.module.js`);
const { schoolNow } = await import(`${D}/common/school-time.js`);

process.env.JWT_SECRET = "e".repeat(40);
let current = new Date("2026-10-11T07:12:00Z");
const clock = { now: () => current };
const at = (iso) => { current = new Date(iso); };

const mod = await Test.createTestingModule({
  imports: [JwtModule.registerAsync({ useFactory: jwtConfigFactory }), PrismaModule, CommonModule, AttendanceModule, TeacherPortalModule],
  providers: [TokenService, { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }],
})
  .overrideProvider(ClockService).useValue(clock)
  .overrideProvider(WhatsappService).useValue(whatsappStub)
  .overrideProvider(NOTIFICATIONS_CONFIG).useValue({ ...notificationsConfigFactory(), workerEnabled: false })
  .compile();
const app = mod.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
await app.init();
await app.listen(0, "127.0.0.1");
const baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
const prisma = app.get(PrismaService); const tokens = app.get(TokenService);

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL", m, extra ?? ""); process.exitCode = 1; } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

// ───────── fixtures ─────────
await prisma.$executeRawUnsafe(`TRUNCATE "schools","guardians" RESTRICT`).catch(() => {});
await prisma.$executeRawUnsafe(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE 'TRUNCATE TABLE "'||r.tablename||'" CASCADE'; END LOOP; END $$;`);
const mkSchool = (code) => prisma.school.create({ data: { name: code, nameEn: code, code } });
const A = await mkSchool("A"), B = await mkSchool("B");
const guardian = await prisma.guardian.create({ data: { phone: "+201000000001", fullName: "ولي", fullNameEn: "Guardian" } });
const mkStaff = (s, email, role = "TEACHER", isActive = true) => prisma.staff.create({ data: { email, password: "x", fullName: email, fullNameEn: email, role, isActive, schoolId: s.id } });
const t1 = await mkStaff(A, "t1@a"), t2 = await mkStaff(A, "t2@a"), adm = await mkStaff(A, "adm@a", "SCHOOL_ADMIN"), tB = await mkStaff(B, "t@b");
const yearOf = (s) => prisma.academicYear.create({ data: { schoolId: s.id, name: "26/27", nameEn: "26/27", startsOn: new Date("2026-09-20"), endsOn: new Date("2027-06-30"), isCurrent: true } });
const yA = await yearOf(A), yB = await yearOf(B);
const mkClass = (s, y, n) => prisma.class.create({ data: { name: n, nameEn: n, grade: "4", gradeEn: "4", schoolId: s.id, academicYearId: y.id } });
const c4A = await mkClass(A, yA, "4A"), c2B = await mkClass(A, yA, "2B"), cB = await mkClass(B, yB, "BB");
const mkStudent = (s, c, i, isActive = true) => prisma.student.create({ data: { nationalId: `${i}`.padStart(14, "0"), fullName: `طالب ${i}`, fullNameEn: `Student ${i}`, gender: "MALE", guardianId: guardian.id, schoolId: s.id, classId: c.id, isActive } });
const s1 = await mkStudent(A, c4A, 1), s2 = await mkStudent(A, c4A, 2), s3 = await mkStudent(A, c4A, 3), sInactive = await mkStudent(A, c4A, 4, false);
const s5 = await mkStudent(A, c2B, 5), sB = await mkStudent(B, cB, 6);
const math = await prisma.subject.create({ data: { schoolId: A.id, name: "رياضيات", nameEn: "Math" } });
const sci = await prisma.subject.create({ data: { schoolId: A.id, name: "علوم", nameEn: "Science" } });
const per = async (n, a, b) => prisma.period.create({ data: { schoolId: A.id, number: n, startTime: a, endTime: b } });
const p3 = await per(3, "10:00", "10:45"), p4 = await per(4, "11:00", "11:45");
const assign = (st, c, sub) => prisma.teacherAssignment.create({ data: { schoolId: A.id, staffId: st.id, classId: c.id, subjectId: sub.id } });
const as1 = await assign(t1, c4A, math), as2 = await assign(t1, c2B, math), as3 = await assign(t2, c4A, sci);
const entry = (as, st, c, p, weekday) => prisma.timetableEntry.create({ data: { schoolId: A.id, assignmentId: as.id, staffId: st.id, classId: c.id, periodId: p.id, weekday } });
const e3 = await entry(as1, t1, c4A, p3, "SUNDAY"), e4 = await entry(as2, t1, c2B, p4, "SUNDAY"), eT2 = await entry(as3, t2, c4A, p4, "SUNDAY"), eMon = await entry(as1, t1, c4A, p3, "MONDAY");
const cats = await Promise.all([["PARTICIPATION", "POSITIVE", 5], ["HOMEWORK", "POSITIVE", 5], ["DISTRACTION", "NEGATIVE", -3]].map(([code, kind, points]) => prisma.behaviorCategory.create({ data: { schoolId: A.id, code, kind, points, name: code, nameEn: code } })));
const rec = (stu, cat, points, voided = false) => prisma.behaviorRecord.create({ data: { schoolId: A.id, studentId: stu.id, categoryId: cat.id, teacherId: t1.id, points, voidedAt: voided ? new Date() : null } });
await rec(s1, cats[0], 5); await rec(s1, cats[1], 5, true); await rec(s1, cats[2], -3); await rec(s2, cats[0], 5);

const tok = (u, role = "TEACHER") => tokens.sign({ type: "staff", sub: u.id, role, schoolId: u.schoolId });
const T1 = tok(t1), T2 = tok(t2), ADM = tok(adm, "SCHOOL_ADMIN"), TB = tok(tB), G = tokens.sign({ type: "guardian", sub: guardian.id, phone: guardian.phone });
const http = () => request(baseUrl);
const api = (m, path, t, body) => { let r = http()[m](path); if (t) r = r.set("Authorization", `Bearer ${t}`); r = body ? r.send(body) : r; return r.then((x) => x, (e) => { console.log("REQ ERR", m, path, JSON.stringify(body)?.slice(0, 80), e.code); throw e; }); };
const status = async (p, code, label, errCode) => { const r = await p; ok(r.status === code && (!errCode || r.body.code === errCode), label, `${r.status} ${JSON.stringify(r.body)}`); return r; };

// ───────── 0. school clock ─────────
let n = schoolNow("Africa/Cairo", new Date("2026-10-10T21:30:00Z"));
eq([n.dateStr, n.weekday, n.time], ["2026-10-11", "SUNDAY", "00:30"], "clock: UTC Saturday 21:30 is already Sunday 00:30 in Cairo");
n = schoolNow("Africa/Cairo", new Date("2026-10-10T21:00:00Z"));
eq(n.time, "00:00", "clock: midnight prints 00:00 (not 24:00)");
n = schoolNow("Africa/Cairo", new Date("2026-12-10T21:30:00Z"));
eq(n.time, "23:30", "clock: winter time is UTC+2 (DST aware)");

// ───────── 1. auth/role boundaries ─────────
await status(api("get", "/staff/me/quick-portal"), 401, "portal: no token -> 401", "AUTH_TOKEN_MISSING");
await status(api("get", "/staff/me/quick-portal", ADM), 403, "portal: school admin -> 403", "AUTH_FORBIDDEN_ROLE");
await status(api("get", "/staff/me/quick-portal", G), 403, "portal: guardian -> 403", "AUTH_FORBIDDEN_ROLE");
await status(api("post", "/attendance-sessions", G, { timetableEntryId: e3.id }), 403, "open: guardian -> 403", "AUTH_FORBIDDEN_ROLE");
await status(api("get", "/api/staff/me/quick-portal", T1), 200, "portal: /api prefix works too");

// ───────── 2. quick-portal states ─────────
let r = await status(api("get", "/staff/me/quick-portal", T1), 200, "portal 10:12 -> 200");
eq(r.body.lessons.map((l) => [l.period.number, l.state]), [[3, "CURRENT"], [4, "UPCOMING"]], "portal: P3 CURRENT, P4 UPCOMING");
eq(r.body.focusLessonId, e3.id, "portal: focus = current lesson");
eq(r.body.roster.map((x) => x.studentId).sort(), [s1.id, s2.id, s3.id].sort(), "portal: roster = active students of the class only (no inactive, no other class)");
eq(r.body.summary, { total: 3, present: 0, late: 0, absent: 0, unmarked: 3 }, "portal: all unmarked at start");
eq(r.body.session, null, "portal: no session yet");
const pts = Object.fromEntries(r.body.roster.map((x) => [x.studentId, x.points]));
eq([pts[s1.id], pts[s2.id], pts[s3.id]], [2, 5, 0], "portal: points = SUM excluding voided");
eq(r.body.behaviorCategories.length, 3, "portal: behavior categories included");
ok(!JSON.stringify(r.body).includes("nationalId"), "portal: no sensitive fields leaked");
eq([r.body.now.date, r.body.now.weekday, r.body.now.time], ["2026-10-11", "SUNDAY", "10:12"], "portal: server-side school time");
at("2026-10-11T05:00:00Z"); r = await api("get", "/staff/me/quick-portal", T1);
eq([r.body.lessons.map((l) => l.state), r.body.focusLessonId], [["UPCOMING", "UPCOMING"], e3.id], "portal 08:00: both upcoming, focus first");
at("2026-10-11T07:50:00Z"); r = await api("get", "/staff/me/quick-portal", T1);
eq([r.body.lessons.map((l) => l.state), r.body.focusLessonId], [["PAST", "UPCOMING"], e4.id], "portal 10:50: P3 past, focus next (P4)");
at("2026-10-11T12:00:00Z"); r = await api("get", "/staff/me/quick-portal", T1);
eq([r.body.lessons.map((l) => l.state), r.body.focusLessonId], [["PAST", "PAST"], e4.id], "portal 15:00: all past, focus last");
at("2026-10-12T07:12:00Z"); r = await api("get", "/staff/me/quick-portal", T1);
eq([r.body.lessons.length, r.body.focusLessonId, r.body.roster.length], [1, eMon.id, 3], "portal Monday: only Monday lesson");
at("2026-10-16T07:12:00Z"); r = await api("get", "/staff/me/quick-portal", T1); // Friday
eq([r.body.lessons, r.body.focusLessonId, r.body.roster], [[], null, []], "portal Friday: no lessons, empty roster");
at("2026-10-11T07:12:00Z");
r = await api("get", "/staff/me/quick-portal", T2);
eq(r.body.lessons.map((l) => l.timetableEntryId), [eT2.id], "portal: teacher sees only her own lessons");
await status(api("get", `/staff/me/quick-portal?timetableEntryId=${eT2.id}`, T1), 404, "portal: other teacher's lesson id -> 404", "PORTAL_LESSON_NOT_FOUND");
r = await api("get", `/staff/me/quick-portal?timetableEntryId=${e4.id}`, T1);
eq([r.body.focusLessonId, r.body.roster.map((x) => x.studentId)], [e4.id, [s5.id]], "portal: explicit lesson selects its class roster");
await status(api("get", "/staff/me/quick-portal?timetableEntryId=not-a-uuid", T1), 400, "portal: bad uuid -> 400");

// ───────── 3. open session ─────────
await status(api("post", "/attendance-sessions", T1, { timetableEntryId: "nope" }), 400, "open: invalid uuid -> 400");
await status(api("post", "/attendance-sessions", T1, { timetableEntryId: e3.id, date: "2020-01-01" }), 400, "open: client-sent date rejected (forbidNonWhitelisted)");
await status(api("post", "/attendance-sessions", T1, { timetableEntryId: "00000000-0000-4000-8000-000000000000" }), 404, "open: unknown entry -> 404", "ATTENDANCE_ENTRY_NOT_FOUND");
await status(api("post", "/attendance-sessions", TB, { timetableEntryId: e3.id }), 404, "open: other school's entry -> 404 (no cross-tenant leak)", "ATTENDANCE_ENTRY_NOT_FOUND");
await status(api("post", "/attendance-sessions", T2, { timetableEntryId: e3.id }), 403, "open: other teacher's lesson -> 403", "ATTENDANCE_NOT_ASSIGNED");
at("2026-10-12T07:12:00Z");
await status(api("post", "/attendance-sessions", T1, { timetableEntryId: e3.id }), 409, "open: Sunday lesson on Monday -> 409", "ATTENDANCE_WRONG_DAY");
at("2026-10-11T07:12:00Z");
r = await status(api("post", "/attendance-sessions", T1, { timetableEntryId: e3.id }), 200, "open: ok");
const sid = r.body.id; eq([r.body.date, r.body.status], ["2026-10-11", "OPEN"], "open: date from server clock, OPEN");
r = await status(api("post", "/attendance-sessions", T1, { timetableEntryId: e3.id }), 200, "open again: idempotent");
eq(r.body.id, sid, "open again: same session id");

// ───────── 4. records ─────────
const put = (stu, body, t = T1, id = sid) => api("put", `/attendance-sessions/${id}/records/${stu}`, t, body);
await status(put(s1.id, { status: "PRESENT" }, T2), 403, "put: other teacher -> 403", "ATTENDANCE_NOT_ASSIGNED");
await status(put(s1.id, { status: "PRESENT" }, TB), 404, "put: other school -> 404", "ATTENDANCE_SESSION_NOT_FOUND");
await status(put(s1.id, { status: "MAYBE" }), 400, "put: invalid status enum -> 400");
await status(put(s1.id, { status: "ABSENT", arrivedAt: "2026-10-11T07:00:00Z" }), 422, "put: absent with arrival time -> 422", "ATTENDANCE_INVALID_ARRIVAL");
await status(put(s1.id, { status: "LATE", arrivedAt: "2026-10-11T09:00:00Z" }), 422, "put: arrival in the future -> 422", "ATTENDANCE_INVALID_ARRIVAL");
await status(put(s5.id, { status: "PRESENT" }), 422, "put: student of another class -> 422", "ATTENDANCE_STUDENT_NOT_IN_CLASS");
await status(put(sB.id, { status: "PRESENT" }), 422, "put: student of another school -> 422", "ATTENDANCE_STUDENT_NOT_IN_CLASS");
await status(put(sInactive.id, { status: "PRESENT" }), 422, "put: inactive student -> 422", "ATTENDANCE_STUDENT_NOT_IN_CLASS");
r = await status(put(s1.id, { status: "PRESENT" }), 200, "put: present");
eq([r.body.records[0].status, r.body.records[0].arrivedAt], ["PRESENT", null], "put: present has no arrival time");
r = await status(put(s2.id, { status: "LATE" }), 200, "put: late"); const late1 = r.body.records[0];
eq(late1.arrivedAt, "2026-10-11T07:12:00.000Z", "put: late without time -> server now");
at("2026-10-11T07:20:00Z");
r = await put(s2.id, { status: "LATE" }); eq([r.body.records[0].arrivedAt, r.body.records[0].markedAt], [late1.arrivedAt, late1.markedAt], "put: retrying same LATE is a true no-op (time unchanged)");
r = await put(s2.id, { status: "LATE", arrivedAt: "2026-10-11T07:05:00Z" }); eq(r.body.records[0].arrivedAt, "2026-10-11T07:05:00.000Z", "put: explicit arrival time honoured");
at("2026-10-11T07:12:00Z");
await put(s3.id, { status: "ABSENT" });
await prisma.attendanceRecord.updateMany({ where: { sessionId: sid, studentId: s3.id }, data: { isExcused: true } });
r = await put(s3.id, { status: "ABSENT" }); eq(await prisma.attendanceRecord.findFirst({ where: { sessionId: sid, studentId: s3.id } }).then((x) => x.isExcused), true, "put: same ABSENT keeps admin's excuse");
await put(s3.id, { status: "PRESENT" }); eq(await prisma.attendanceRecord.findFirst({ where: { sessionId: sid, studentId: s3.id } }).then((x) => [x.isExcused, x.status]), [false, "PRESENT"], "put: ABSENT->PRESENT clears the excuse (DB CHECK satisfied)");
eq(await prisma.attendanceRecord.count({ where: { sessionId: sid } }), 3, "put: still exactly one record per student");

// ───────── 5. bulk ─────────
const bulk = (records, t = T1, id = sid) => api("put", `/attendance-sessions/${id}/records`, t, { records });
await status(bulk([]), 400, "bulk: empty -> 400");
await status(bulk(Array.from({ length: 101 }, () => ({ studentId: s1.id, status: "PRESENT" }))), 400, "bulk: >100 -> 400");
await status(bulk([{ studentId: s1.id, status: "PRESENT" }, { studentId: s1.id, status: "ABSENT" }]), 422, "bulk: duplicate student -> 422", "ATTENDANCE_DUPLICATE_STUDENT");
const before = await prisma.attendanceRecord.findFirst({ where: { sessionId: sid, studentId: s1.id } });
r = await status(bulk([{ studentId: s1.id, status: "ABSENT" }, { studentId: s5.id, status: "PRESENT" }]), 422, "bulk: one foreign student rejects the WHOLE batch", "ATTENDANCE_STUDENT_NOT_IN_CLASS");
eq(r.body.studentIds, [s5.id], "bulk: error names the offending student");
eq((await prisma.attendanceRecord.findFirst({ where: { sessionId: sid, studentId: s1.id } })).status, before.status, "bulk: failed batch changed nothing (atomic)");
r = await status(bulk([s1, s2, s3].map((s) => ({ studentId: s.id, status: "PRESENT" }))), 200, "bulk: mark all present");
eq(r.body.records.map((x) => x.status), ["PRESENT", "PRESENT", "PRESENT"], "bulk: all present");

// ───────── 6. portal reflects the session ─────────
r = await api("get", "/staff/me/quick-portal", T1);
eq([r.body.session.id, r.body.session.status, r.body.summary], [sid, "OPEN", { total: 3, present: 3, late: 0, absent: 0, unmarked: 0 }], "portal: shows open session + summary");

// ───────── 7. submit ─────────
const sid2 = (await api("post", "/attendance-sessions", T1, { timetableEntryId: e4.id })).body.id; // 2B: one student, unmarked
r = await status(api("post", `/attendance-sessions/${sid2}/submit`, T1), 409, "submit: incomplete -> 409", "ATTENDANCE_INCOMPLETE");
eq([r.body.unmarkedCount, r.body.unmarkedStudentIds], [1, [s5.id]], "submit: lists unmarked students");
eq((await prisma.attendanceSession.findUnique({ where: { id: sid2 } })).status, "OPEN", "submit: failed submit leaves session OPEN");
await status(api("post", `/attendance-sessions/${sid}/submit`, T2), 403, "submit: other teacher -> 403", "ATTENDANCE_NOT_ASSIGNED");
await put(s1.id, { status: "ABSENT" });
r = await status(api("post", `/attendance-sessions/${sid}/submit`, T1), 200, "submit: ok");
eq([r.body.session.status, r.body.summary], ["SUBMITTED", { total: 3, present: 2, late: 0, absent: 1 }], "submit: SUBMITTED + summary");
const submittedAt = r.body.session.submittedAt; ok(!!submittedAt, "submit: submittedAt set");
r = await status(api("post", `/attendance-sessions/${sid}/submit`, T1), 200, "submit again: idempotent");
eq(r.body.session.submittedAt, submittedAt, "submit again: same submittedAt");
await status(put(s1.id, { status: "PRESENT" }), 409, "put after submit -> 409", "ATTENDANCE_SESSION_LOCKED");
await status(bulk([{ studentId: s1.id, status: "PRESENT" }]), 409, "bulk after submit -> 409", "ATTENDANCE_SESSION_LOCKED");
eq((await api("post", "/attendance-sessions", T1, { timetableEntryId: e3.id })).body.status, "SUBMITTED", "open after submit returns the submitted session (no duplicate)");

// ───────── 8. concurrency ─────────
await prisma.notification.deleteMany();
await prisma.attendanceRecord.deleteMany(); await prisma.attendanceSession.deleteMany();
const opens = await Promise.all(Array.from({ length: 12 }, () => api("post", "/attendance-sessions", T1, { timetableEntryId: e3.id })));
eq(new Set(opens.map((x) => x.status)), new Set([200]), "race: 12 parallel opens all 200 (no 500 from unique violation)");
eq(new Set(opens.map((x) => x.body.id)).size, 1, "race: 12 parallel opens -> one session id");
eq(await prisma.attendanceSession.count(), 1, "race: exactly one session row");
const cid = opens[0].body.id;
const puts = await Promise.all(["PRESENT", "LATE", "ABSENT", "PRESENT", "LATE", "ABSENT", "PRESENT", "ABSENT"].map((st) => put(s1.id, { status: st }, T1, cid)));
ok(puts.every((x) => x.status === 200), "race: parallel PUTs on one student never 500", puts.map((x) => x.status));
eq(await prisma.attendanceRecord.count({ where: { sessionId: cid, studentId: s1.id } }), 1, "race: one record row after parallel PUTs");
let putFirst = 0, submitFirst = 0, bad = 0;
for (let i = 0; i < 60; i++) {
  await prisma.attendanceRecord.deleteMany({ where: { sessionId: cid } });
  await prisma.attendanceSession.update({ where: { id: cid }, data: { status: "OPEN", submittedAt: null } });
  await bulk([s1, s2, s3].map((s) => ({ studentId: s.id, status: "PRESENT" })), T1, cid);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = Math.random() * 6;
  const [a, b] = await Promise.all([
    (i % 2 === 0 ? delay(jitter) : Promise.resolve()).then(() => put(s1.id, { status: "ABSENT" }, T1, cid)),
    (i % 2 === 1 ? delay(jitter) : Promise.resolve()).then(() => api("post", `/attendance-sessions/${cid}/submit`, T1)),
  ]);
  const finalRec = (await prisma.attendanceRecord.findFirst({ where: { sessionId: cid, studentId: s1.id } })).status;
  const sess = await prisma.attendanceSession.findUnique({ where: { id: cid } });
  const consistent = b.status === 200 && sess.status === "SUBMITTED" && ((a.status === 200 && finalRec === "ABSENT") || (a.status === 409 && a.body.code === "ATTENDANCE_SESSION_LOCKED" && finalRec === "PRESENT"));
  if (!consistent) bad++; else if (a.status === 200) putFirst++; else submitFirst++;
}
ok(bad === 0, "race: submit vs PUT is always consistent (a write either lands before the lock or is rejected)", `inconsistent=${bad}`);
console.log(`   (race outcomes over 60 runs: PUT-first=${putFirst}, submit-first=${submitFirst})`);

console.log(`\n${fail === 0 ? "ALL GOOD" : "FAILURES"}: ${pass} passed, ${fail} failed`);
await app.close();
