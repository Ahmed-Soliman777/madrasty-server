import type { StaffUser } from "../auth/auth-user.type.js";
import { PrismaService } from "../prisma.service.js";
import { CommunicationLogService } from "./communication-log.service.js";

describe("CommunicationLogService", () => {
  let service: CommunicationLogService;
  const findMany = jest.fn();
  const count = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommunicationLogService({
      notification: { findMany, count },
    } as unknown as PrismaService);
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  const teacher: StaffUser = {
    type: "staff",
    id: "teacher-1",
    role: "TEACHER",
    schoolId: "school-1",
  };

  const schoolAdmin: StaffUser = {
    type: "staff",
    id: "admin-1",
    role: "SCHOOL_ADMIN",
    schoolId: "school-1",
  };

  it("limits teachers to notifications created by their own operations", async () => {
    await service.getCommunicationLog(teacher, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1", createdById: "teacher-1" },
      }),
    );
  });

  it("limits school administrators to their own school", async () => {
    await service.getCommunicationLog(schoolAdmin, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "school-1" } }),
    );
  });

  it("applies filters, pagination, and newest-first ordering", async () => {
    await service.getCommunicationLog(teacher, {
      page: 2,
      limit: 10,
      status: "FAILED",
      type: "STUDENT_ABSENT",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-31T23:59:59.999Z",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: expect.objectContaining({
          schoolId: "school-1",
          createdById: "teacher-1",
          status: "FAILED",
          type: "STUDENT_ABSENT",
          createdAt: {
            gte: new Date("2026-10-01T00:00:00.000Z"),
            lte: new Date("2026-10-31T23:59:59.999Z"),
          },
        }),
      }),
    );
  });

  it("rejects an inverted date range", async () => {
    await expect(
      service.getCommunicationLog(teacher, {
        from: "2026-10-31T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("The from date must not be after the to date");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns a safe failure code without exposing provider error details", async () => {
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        type: "STUDENT_ABSENT",
        channel: "WHATSAPP",
        status: "FAILED",
        attempts: 3,
        createdAt: new Date("2026-10-19T08:30:00.000Z"),
        sentAt: null,
        student: {
          id: "student-1",
          fullName: "Ahmed Ali",
          fullNameEn: "Ahmed Ali",
        },
        homework: null,
      },
    ]);
    count.mockResolvedValue(1);

    const result = await service.getCommunicationLog(teacher, {});

    expect(result.items[0]).toMatchObject({
      id: "notification-1",
      status: "FAILED",
      failureReason: "SEND_FAILED",
      student: { id: "student-1", name: "Ahmed Ali" },
    });
    expect(result.items[0]).not.toHaveProperty("body");
    expect(result.items[0]).not.toHaveProperty("guardian");
    expect(result.items[0]).not.toHaveProperty("statusReason");
  });
});
