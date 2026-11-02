# Madrasty Server

Madrasty is a school-agnostic school-management platform. This repository contains its NestJS REST API, business services, Prisma/PostgreSQL data access, and WhatsApp-backed OTP and notification delivery.

Implemented workflows include guardian OTP login and linked-student data, staff login, attendance sessions and records, behavior records, homework, teacher quick-portal data, timetable management, and a WhatsApp notification queue and communication log. The frontend currently exposes guardian, teacher, and school-administrator workflows; some schema roles and backend capabilities do not have corresponding frontend screens.

The web client calls the endpoints under `/api/...` directly. See the [client README](https://github.com/Ahmed-Soliman777/madrasty-client/blob/master/README.md) for frontend setup and UI scope.

## Architecture

### Application structure

NestJS modules group controllers, services, DTOs, and feature logic. Nest dependency injection wires feature services and shared providers. Feature services use the globally provided `PrismaService` directly; there is no separate repository layer.

- `AuthModule` provides JWT token services, global authentication and role guards, and WhatsApp OTP service.
- `AttendanceModule`, `BehaviorModule`, `HomeworkModule`, and `TeacherPortalModule` implement classroom operations and teacher data views.
- `TimetableModule` handles timetable generation, editing, and publishing. Draft generation runs synchronously in the service; the generation-job model records the result.
- `NotificationsModule` queues and processes WhatsApp notifications, exposes the communication log, and owns retry/dispatch configuration.
- `PrismaModule` provides the Prisma client using Prisma’s PostgreSQL driver adapter. `CommonModule` provides shared clock functionality.
- DTOs use `class-validator`; a global Nest `ValidationPipe` transforms input, strips unknown fields, and rejects non-whitelisted fields.
- Authentication/authorization is applied by global guards. `@Public()`, `@Roles()`, and `@CurrentUser()` define endpoint access and access to the resolved user. Services enforce school-scoped business rules.
- Standard Nest exceptions and feature error classes represent API failures. No application-wide custom exception filter is registered.

```mermaid
flowchart TB
  Client[Next.js client]
  Nest[NestJS application]
  Auth[AuthModule<br/>JWT, guards, WhatsApp OTP]
  Features[Attendance, behavior, homework,<br/>teacher portal, timetable]
  Notify[NotificationsModule<br/>queue worker and communication log]
  Common[CommonModule]
  Prisma[PrismaModule<br/>PrismaService]
  DB[(PostgreSQL)]
  WA[Linked WhatsApp session]

  Client --> Nest
  Nest --> Auth
  Nest --> Features
  Nest --> Notify
  Nest --> Common
  Auth --> Prisma
  Features --> Prisma
  Notify --> Prisma
  Auth --> WA
  Notify --> WA
  Prisma --> DB
```

### Authentication and API access

Guardians request a six-digit OTP using a student national ID. `WhatsappService` sends it through a linked WhatsApp session; OTP records expire after five minutes. Staff authenticate with email and password. Both flows issue a signed JWT.

For browser clients that send `X-Client-Type: web`, login sets an HttpOnly `accessToken` cookie and omits the token from the JSON body. Other clients can receive the token in the response and authenticate with a bearer token. Authenticated requests may use the cookie or bearer token. `AuthGuard` resolves staff status/role from the database, and `RolesGuard` checks endpoint role declarations.

`main.ts` enables credentialed CORS for the comma-separated `FRONTEND_ORIGINS` allowlist, defaulting to `http://localhost:3000`. The auth guard also rejects disallowed origins on authenticated non-safe requests. Web cookies use `SameSite=Lax`; `Secure` is enabled in production. `AUTH_COOKIE_DOMAIN` is optional and is for deployments that need a shared parent domain.

```mermaid
sequenceDiagram
  participant B as Browser
  participant F as Next.js
  participant A as NestJS API
  participant W as Linked WhatsApp
  participant D as PostgreSQL

  B->>F: Enter student ID or staff credentials
  F->>A: POST /api/auth/... with X-Client-Type: web
  A->>D: Validate user / create OTP record
  opt Guardian OTP request
    A->>W: Send verification code
  end
  A-->>B: Set HttpOnly accessToken cookie
  B->>A: Credentialed request to /api/...
  A->>D: Verify JWT and load role-scoped data
  A-->>B: JSON response
```

### Notifications

The notification worker polls due database records, claims work, sends through the WhatsApp channel, and records outcomes and retries. It starts by default and can be disabled with `NOTIFICATIONS_WORKER_ENABLED=false`. WhatsApp itself is initialized by `WhatsappService` at application startup, independently of whether the worker is disabled.

## Technology stack

| Area | Verified implementation |
|---|---|
| Framework | NestJS 11 (`@nestjs/core` installed as 11.2.5) |
| Language/runtime | TypeScript (`^5.7.3`), Node.js |
| Database | PostgreSQL |
| ORM / driver | Prisma 7.10.0, `@prisma/adapter-pg`, `pg` |
| Authentication | `@nestjs/jwt` / `jsonwebtoken` integration from Nest, JWT HS256; `bcrypt` for staff password comparison |
| Messaging | Baileys WhatsApp Web client and `qrcode-terminal` for pairing |
| Validation | `class-validator`, `class-transformer`, Nest `ValidationPipe` |
| Tests | Jest, `@nestjs/testing`, Supertest |
| Build / quality | Nest CLI, TypeScript, ESLint 9, Prettier |

The Prisma generator writes the client under `src/generated/prisma`; `PrismaService` connects through `PrismaPg`. There is no separate job-queue service: notification dispatch is an in-process polling worker.

## Prerequisites

- Node.js version accepted by the installed Prisma 7 packages: `^20.19`, `^22.12`, or `>=24.0`. Node 22.12+ or Node 24+ is recommended for running both repositories.
- npm and the checked-in `package-lock.json`; use `npm ci`.
- PostgreSQL. The repository does not pin a PostgreSQL server version.
- A WhatsApp account that can be linked as a device to enable guardian OTP and WhatsApp notifications. The app prints a QR code in the backend terminal when no saved session exists.

No Node version file or `.env` is present. `baileys_auth_info/` stores linked-session credentials and is Git-ignored; keep it private.

## Environment variables

Create a private `.env` in the server repository root. There is no checked-in template.

### Runtime configuration

| Variable | Required | Default / purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma’s PostgreSQL adapter. Manual integration scripts also require its database name to end in `_test`. |
| `JWT_SECRET` | Yes | JWT signing secret. Startup fails if unset; use a random secret of at least 32 characters. |
| `PORT` | No | HTTP listen port; defaults to `5000`. |
| `FRONTEND_ORIGINS` | No | Comma-separated browser origin allowlist; defaults to `http://localhost:3000`. |
| `AUTH_COOKIE_DOMAIN` | No | Cookie domain; unset for local development. |
| `JWT_EXPIRES_IN_SECONDS` | No | JWT and cookie lifetime; defaults to 3600 seconds. |
| `NODE_ENV` | No | When `production`, sets auth cookie `Secure`. |
| `NOTIFICATIONS_WORKER_ENABLED` | No | Worker starts unless the value is exactly `false`. |
| `NOTIFICATIONS_POLL_MS` | No | Worker polling interval in milliseconds; default `5000`. |
| `NOTIFICATIONS_BATCH_SIZE` | No | Maximum due notifications selected per poll; default `20`. |
| `NOTIFICATIONS_SEND_INTERVAL_MS` | No | Delay between sends; default `1500`. |
| `NOTIFICATIONS_SEND_JITTER_MS` | No | Random additional send delay; default `1000`. |
| `NOTIFICATIONS_MAX_ATTEMPTS` | No | Retry limit; default `5`. |
| `NOTIFICATIONS_ABSENCE_DELAY_MS` | No | Delay before absence notification; default `600000` (10 minutes). |
| `NOTIFICATIONS_LOCALE` | No | Message locale; exactly `en` selects English, otherwise Arabic. |
| `DIST` | No; manual integration scripts only | Override the compiled module directory used by scripts under `scripts/`; defaults to `dist/src`. |

Example local runtime `.env`:

```env
DATABASE_URL=postgresql://madrasty:replace-with-local-password@localhost:5432/madrasty?schema=public
JWT_SECRET=replace-this-with-a-random-local-secret-at-least-32-characters
PORT=5000
FRONTEND_ORIGINS=http://localhost:3000
```

Use only local disposable credentials in examples and never commit `.env`.

### Seed-only configuration

`prisma/seed.ts` requires the following variables when run; they are not needed just to start the API:

| Variables | Purpose |
|---|---|
| `SEED_SCHOOL_CODE` | Selects a school that already exists in the database. |
| `SEED_TEACHER_EMAIL`, `SEED_TEACHER_PASSWORD`, `SEED_TEACHER_NAME_AR`, `SEED_TEACHER_NAME_EN` | Base teacher account to add or reuse. |
| `SEED_GUARDIAN_PHONE`, `SEED_GUARDIAN_NATIONAL_ID`, `SEED_GUARDIAN_NAME_AR`, `SEED_GUARDIAN_NAME_EN` | Base guardian record. |
| `SEED_STUDENT_1_NATIONAL_ID`, `SEED_STUDENT_1_NAME_AR`, `SEED_STUDENT_1_NAME_EN`, `SEED_STUDENT_1_GENDER` | First base student. |
| `SEED_STUDENT_2_NATIONAL_ID`, `SEED_STUDENT_2_NAME_AR`, `SEED_STUDENT_2_NAME_EN`, `SEED_STUDENT_2_GENDER` | Second base student. |
| `SEED_CLASS_1_NAME_AR`, `SEED_CLASS_1_NAME_EN`, `SEED_CLASS_1_GRADE_AR`, `SEED_CLASS_1_GRADE_EN` | First base class label and grade for the configured base student. |
| `SEED_CLASS_2_NAME_AR`, `SEED_CLASS_2_NAME_EN`, `SEED_CLASS_2_GRADE_AR`, `SEED_CLASS_2_GRADE_EN` | Second base class label and grade for the configured base student. |
| `SEED_DEMO_CLASSES_JSON` | JSON array of exactly five additional classes; each has `nameAr`, `nameEn`, `gradeAr`, `gradeEn`. |
| `SEED_DEMO_TEACHERS_JSON` | JSON array of exactly eight additional teachers: two Mathematics, three Arabic Language, and three English Language teachers. Each has `email`, `password`, `nameAr`, `nameEn`, and `subjectNameEn`. |
| `SEED_DEMO_STUDENTS_JSON` | JSON array of exactly 68 additional students with bilingual names, national ID, `gender`, `classNameEn`, and nested guardian data (`phone`, `nationalId`, `nameAr`, `nameEn`). |
| `SEED_TEST_OTP_CODE` | Optional local test OTP inserted for the configured guardian. Do not set outside isolated local testing. |

The seed requires the selected school and a current academic year to exist first; it deliberately does not create either. It is additive and reports that it does not delete or overwrite existing records. It does not create timetable entries. Do not use real student/guardian personal data in a development database.

**Documentation note:** `docs/timetable-migration-runbook.md` contains an older warning that the seed deletes operational data. That conflicts with the current `prisma/seed.ts` implementation and [additive seed notes](docs/additive-demo-seed.md); reconcile the runbook before relying on its seed warning. The additive seed notes also refer to `.env.seed.example`, which is not currently present in the repository.

## Running the backend locally

Clone the repository, then install dependencies:

```bash
git clone https://github.com/Ahmed-Soliman777/madrasty-server.git
cd madrasty-server
npm ci
```

Create `.env` with at least `DATABASE_URL` and `JWT_SECRET` from the table above. Start PostgreSQL and create a local role/database matching the connection URL. For example, from `psql` connected to a local administrative database:

```sql
CREATE USER madrasty WITH PASSWORD 'replace-with-local-password';
CREATE DATABASE madrasty OWNER madrasty;
```

Then prepare its schema and Prisma client:

```bash
npx prisma migrate dev
npx prisma generate
```

`migrate dev` applies checked-in migrations and creates a migration when the local schema has changes; `generate` creates the Prisma client in `src/generated/prisma`.

To run the seed, set all required `SEED_*` values and first provision the referenced school and its current academic year. Then run:

```bash
npx prisma db seed
```

The seed is not a from-empty-database bootstrap and requires a substantial locally supplied dataset; skip it until those prerequisites are met.

Start the API:

```bash
npm run start:dev
```

The server listens on port **5000** by default. A `GET /` request returns `Hello World!`; this is the only root probe, not a dedicated health-check endpoint. For example:

```bash
curl http://localhost:5000/
```

On first startup without saved WhatsApp credentials, scan the QR code printed in the terminal using WhatsApp’s linked-devices flow. Until linked and connected, guardian OTP delivery and WhatsApp notifications cannot be sent.

### Production build and start

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

Set production environment variables before starting. `migrate deploy` applies committed migrations without creating new ones. `start:prod` runs `node dist/main`.

## Database

The schema in `prisma/schema.prisma` uses PostgreSQL. Migrations are checked in under `prisma/migrations`; Prisma 7 settings, including the datasource URL and seed command, are in `prisma7.config.ts`.

Main model groups:

- **School structure and accounts:** `School`, `AcademicYear`, `Class`, `Guardian`, `Student`, `Staff`, `Subject`, `Period`, and `TeacherAssignment`.
- **Timetables:** versioned `Timetable` records, `TimetableEntry` slots, and `TimetableGenerationJob` results.
- **Student records:** `AttendanceSession`, `AttendanceRecord`, `BehaviorCategory`, and `BehaviorRecord`.
- **Homework and messaging:** `Homework`, `Notification`, and `OtpVerification`.

School-owned data is linked through `schoolId`; composite relations and constraints keep classes, assignments, schedules, and records associated with the same school. Guardian records may link to multiple students; teachers have assignments; attendance records connect students to submitted sessions; homework is associated with a teacher assignment; notifications reference the relevant school, guardian, student/homework/session, and creator.

```mermaid
erDiagram
  SCHOOL ||--o{ CLASS : contains
  SCHOOL ||--o{ STAFF : employs
  SCHOOL ||--o{ ACADEMIC_YEAR : defines
  SCHOOL ||--o{ SUBJECT : offers
  SCHOOL ||--o{ PERIOD : defines
  GUARDIAN ||--o{ STUDENT : links
  CLASS ||--o{ STUDENT : enrolls
  STAFF ||--o{ TEACHER_ASSIGNMENT : teaches
  CLASS ||--o{ TEACHER_ASSIGNMENT : assigned
  SUBJECT ||--o{ TEACHER_ASSIGNMENT : covers
  ACADEMIC_YEAR ||--o{ CLASS : groups
  ACADEMIC_YEAR ||--o{ TIMETABLE : schedules
  TIMETABLE ||--o{ TIMETABLE_ENTRY : contains
  TEACHER_ASSIGNMENT ||--o{ TIMETABLE_ENTRY : schedules
  PERIOD ||--o{ TIMETABLE_ENTRY : occupies
  TIMETABLE_ENTRY ||--o{ ATTENDANCE_SESSION : records
  ATTENDANCE_SESSION ||--o{ ATTENDANCE_RECORD : contains
  STUDENT ||--o{ ATTENDANCE_RECORD : receives
  STUDENT ||--o{ BEHAVIOR_RECORD : receives
  STAFF ||--o{ BEHAVIOR_RECORD : records
  TEACHER_ASSIGNMENT ||--o{ HOMEWORK : assigns
  GUARDIAN ||--o{ NOTIFICATION : receives
```

### Migration and reset commands

```bash
npx prisma migrate status
npx prisma migrate dev
npx prisma migrate deploy
npx prisma generate
```

For a disposable local database only, `npx prisma migrate reset` drops and recreates the schema, reapplies migrations, and can invoke the configured seed. It destroys database data. The seed prerequisites above still apply; do not point reset at shared or production data.

## Tests and code quality

The package scripts are:

```bash
npm run test
npm run test:e2e
npm run test:cov
npm run lint
npm run build
```

- `npm run test` runs Jest unit specs. Current specs cover the root controller and notification communication-log service.
- `npm run test:e2e` runs `test/app.e2e-spec.ts`, a basic root `GET /` smoke test. It imports the application module and may initialize database/JWT/WhatsApp services; configure runtime dependencies as needed.
- `npm run test:cov` runs the same unit suite with coverage.
- `npm run lint` runs ESLint with `--fix`, so it may modify files.
- `npm run build` compiles the Nest application.

`scripts/attendance-integration.mjs`, `scripts/notifications-integration.mjs`, and `scripts/notifications-absence-integration.mjs` are additional manual integration scripts, not package scripts. Build first, then run `node scripts/attendance-integration.mjs`, `node scripts/notifications-integration.mjs`, or `node scripts/notifications-absence-integration.mjs` against a disposable PostgreSQL database whose name ends in `_test`. Their test harness truncates tables; never point them at development data you need to keep or at production.

## Running both applications together

For an end-to-end local workflow:

1. Install PostgreSQL and create a local database and role as described above.
2. In `madrasty-server`, create `.env` with `DATABASE_URL`, a random `JWT_SECRET`, and `FRONTEND_ORIGINS=http://localhost:3000`.
3. Run `npm ci`, `npx prisma migrate dev`, and `npx prisma generate` in the server repository.
4. If you need populated screens, provision a school and current academic year, then provide the full seed configuration and run `npx prisma db seed`. The seed cannot initialize those two base records itself.
5. Start the server with `npm run start:dev` and verify `GET http://localhost:5000/`.
6. Link WhatsApp from the QR code in the server terminal if you need guardian OTP or notification delivery.
7. In `madrasty-client`, create `.env` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000` and `BACKEND_API_URL=http://localhost:5000`.
8. Run `npm ci` and `npm run dev` in the client repository, then visit `http://localhost:3000`.
9. Keep backend `FRONTEND_ORIGINS` aligned with the actual frontend origin. Browser authentication relies on an HttpOnly cookie and credentialed CORS requests.

See the [client README](https://github.com/Ahmed-Soliman777/madrasty-client/blob/master/README.md) for frontend-specific instructions.

## Troubleshooting

| Symptom | Check |
|---|---|
| Prisma cannot connect | Verify PostgreSQL is running, the database exists, and `DATABASE_URL` has the correct host, port, user, password, and database name. |
| Startup reports missing JWT configuration | Set `JWT_SECRET` to a random value of at least 32 characters. |
| Prisma client cannot be imported | Run `npx prisma generate` after installing dependencies or changing the Prisma schema. |
| Migration fails or reports drift | Check `DATABASE_URL` and `npx prisma migrate status`; inspect migration history before applying schema changes. |
| Guardian OTP fails | Confirm the terminal QR was paired and WhatsApp is connected; the service retries connection but does not send while disconnected. |
| Browser request fails CORS | Set `FRONTEND_ORIGINS` to the exact browser origin, including scheme and port. The API uses credentialed CORS. |
| Cookie is absent in production | Check HTTPS, `SameSite=Lax`, and whether a shared `AUTH_COOKIE_DOMAIN` is needed for the frontend/API domain arrangement. |
| Port is in use | Set `PORT` to an available port and update both frontend backend-URL variables accordingly. |
| Seed reports missing school/year | Create the referenced school and a current academic year first. The seed intentionally does not create these records. |
| Integration test refuses its database | Use a disposable database name ending in `_test`; scripts truncate fixture tables. |

## Project structure

```text
src/
  auth/               JWT auth, role guards/decorators, WhatsApp OTP
  attendance/         Attendance-session and record endpoints/services
  behavior/           Behavior-category record actions
  common/             Shared clock and school-time utilities
  homework/           Homework endpoints and services
  notifications/      Notification dispatch, WhatsApp channel, log
  teacher-portal/     Teacher quick-portal data
  timetable/          Timetable generation and administration
  prisma.module.ts    Global Prisma provider module
  prisma.service.ts   Prisma client and PostgreSQL adapter
  generated/prisma/   Generated client output (created by `npx prisma generate`)
prisma/
  migrations/         Versioned SQL migrations
  schema.prisma       PostgreSQL data model
  seed.ts             Additive, environment-configured local seed
scripts/              Manual integration scripts and SQL helpers
test/                 Jest end-to-end smoke test
docs/                 Migration and seed operational notes
```

## Related documentation

- [Madrasty Client README](https://github.com/Ahmed-Soliman777/madrasty-client/blob/master/README.md)
- [Timetable migration runbook](docs/timetable-migration-runbook.md)
- [Additive demo seed notes](docs/additive-demo-seed.md)
