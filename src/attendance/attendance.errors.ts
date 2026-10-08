export const AttendanceErrorCode = {
  EntryNotFound: "ATTENDANCE_ENTRY_NOT_FOUND",
  NotAssigned: "ATTENDANCE_NOT_ASSIGNED",
  WrongDay: "ATTENDANCE_WRONG_DAY",
  SessionNotFound: "ATTENDANCE_SESSION_NOT_FOUND",
  SessionLocked: "ATTENDANCE_SESSION_LOCKED",
  StudentNotInClass: "ATTENDANCE_STUDENT_NOT_IN_CLASS",
  DuplicateStudent: "ATTENDANCE_DUPLICATE_STUDENT",
  InvalidArrival: "ATTENDANCE_INVALID_ARRIVAL",
  Incomplete: "ATTENDANCE_INCOMPLETE",
} as const;
