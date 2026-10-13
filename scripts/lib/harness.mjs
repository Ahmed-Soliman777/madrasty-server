import "reflect-metadata";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Test } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import request from "supertest";

const dbName = new URL(
  process.env.DATABASE_URL ?? "postgresql://x/none",
).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(
    `Refusing to run: DATABASE_URL must point to a database whose name ends with "_test" (got "${dbName}")`,
  );
  process.exit(1);
}
const D = pathToFileURL(resolve(process.env.DIST ?? "dist/src")).href; 
const load = (file) => import(`${D}/${file}`);

export async function createHarness(
  modules,
  startAt = "2026-10-11T07:12:00Z",
  options = {},
) {
  process.env.JWT_SECRET = "h".repeat(40);
  const { TokenService, jwtConfigFactory } = await load(
    "auth/token.service.js",
  );
  const { AuthGuard } = await load("auth/guards/auth.guard.js");
  const { RolesGuard } = await load("auth/guards/roles.guard.js");
  const { PrismaModule } = await load("prisma.module.js");
  const { PrismaService } = await load("prisma.service.js");
  const { CommonModule } = await load("common/common.module.js");
  const { ClockService } = await load("common/clock.service.js");
  const { WhatsappService, normalizeEgyptianPhone } = await load(
    "auth/whatsapp.service.js",
  );
  const { NOTIFICATIONS_CONFIG, notificationsConfigFactory } = await load(
    "notifications/notifications.config.js",
  );
  const featureModules = await Promise.all(
    modules.map(async ([f, n]) => (await load(f))[n]),
  );

  const whatsapp = options.whatsapp ?? {
    sent: [],
    connected: true,
    mode: "sent",
    onModuleInit() { },
    onModuleDestroy() { },
    isConnected() {
      return this.connected;
    },
    async sendOtp() {
      return true;
    },
    async sendText(phone, text) {
      if (!this.connected) return "not_connected";
      if (!normalizeEgyptianPhone(phone)) return "invalid_phone";
      const mode =
        typeof this.mode === "function" ? this.mode(phone, text) : this.mode;
      if (mode === "sent") this.sent.push({ phone, text });
      return mode;
    },
  };
  const notificationsConfig = {
    ...notificationsConfigFactory(),
    workerEnabled: false,
    sendIntervalMs: 0,
    sendJitterMs: 0,
    ...options.config,
  };

  let current = new Date(startAt);
  const clock = { now: () => current };
  const mod = await Test.createTestingModule({
    imports: [
      JwtModule.registerAsync({ useFactory: jwtConfigFactory }),
      PrismaModule,
      CommonModule,
      ...featureModules,
    ],
    providers: [
      TokenService,
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  })
    .overrideProvider(ClockService)
    .useValue(clock)
    .overrideProvider(WhatsappService)
    .useValue(whatsapp)
    .overrideProvider(NOTIFICATIONS_CONFIG)
    .useValue(notificationsConfig)
    .compile();
  const app = mod.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const prisma = app.get(PrismaService);
  const tokens = app.get(TokenService);

  await prisma.$executeRawUnsafe(
    `DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE 'TRUNCATE TABLE "'||r.tablename||'" CASCADE'; END LOOP; END $$;`,
  );

  let pass = 0,
    fail = 0;
  const ok = (cond, label, extra) => {
    if (cond) pass++;
    else {
      fail++;
      process.exitCode = 1;
      console.log("FAIL", label, extra ?? "");
    }
  };
  const eq = (a, b, label) =>
    ok(
      JSON.stringify(a) === JSON.stringify(b),
      label,
      `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`,
    );
  const api = (method, path, token, body) => {
    let r = request(baseUrl)[method](path);
    if (token) r = r.set("Authorization", `Bearer ${token}`);
    return body ? r.send(body) : r;
  };
  /** يتحقق من status (واختيارياً code) ويرجّع الـ response */
  const expectStatus = async (promise, status, label, code) => {
    const r = await promise;
    ok(
      r.status === status && (!code || r.body.code === code),
      label,
      `${r.status} ${JSON.stringify(r.body)}`,
    );
    return r;
  };
  const staffToken = (u, role = "TEACHER") =>
    tokens.sign({ type: "staff", sub: u.id, role, schoolId: u.schoolId });
  return {
    app,
    prisma,
    tokens,
    api,
    ok,
    eq,
    expectStatus,
    staffToken,
    whatsapp,
    notificationsConfig,
    load,
    get: (token) => app.get(token),
    at: (iso) => {
      current = new Date(iso);
    },
    finish: async () => {
      console.log(
        `\n${fail === 0 ? "ALL GOOD" : "FAILURES"}: ${pass} passed, ${fail} failed`,
      );
      await app.close();
    },
  };
}
