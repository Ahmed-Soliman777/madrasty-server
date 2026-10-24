-- Read-only preflight audit for the safe timetable migration.
-- Run this against the target database before applying the migration.
-- It intentionally reports legacy conflicts rather than modifying or deleting rows.

\\echo '1. Active teacher slot conflicts'
SELECT
  entry."schoolId",
  entry."staffId",
  entry."weekday",
  entry."periodId",
  COUNT(*) AS entry_count,
  ARRAY_AGG(entry."id" ORDER BY entry."id") AS entry_ids,
  ARRAY_AGG(entry."assignmentId" ORDER BY entry."assignmentId") AS assignment_ids
FROM "timetable_entries" AS entry
WHERE entry."isActive" = TRUE
GROUP BY entry."schoolId", entry."staffId", entry."weekday", entry."periodId"
HAVING COUNT(*) > 1
ORDER BY entry."schoolId", entry."weekday", entry."periodId", entry."staffId";

\\echo '2. Active class slot conflicts'
SELECT
  entry."schoolId",
  entry."classId",
  entry."weekday",
  entry."periodId",
  COUNT(*) AS entry_count,
  ARRAY_AGG(entry."id" ORDER BY entry."id") AS entry_ids,
  ARRAY_AGG(entry."assignmentId" ORDER BY entry."assignmentId") AS assignment_ids
FROM "timetable_entries" AS entry
WHERE entry."isActive" = TRUE
GROUP BY entry."schoolId", entry."classId", entry."weekday", entry."periodId"
HAVING COUNT(*) > 1
ORDER BY entry."schoolId", entry."weekday", entry."periodId", entry."classId";

\\echo '3. Active weekly lessons inferred per assignment'
SELECT
  assignment."schoolId",
  assignment."id" AS assignment_id,
  assignment."staffId",
  assignment."classId",
  assignment."subjectId",
  COUNT(entry."id") FILTER (WHERE entry."isActive" = TRUE) AS active_lessons_per_week,
  COUNT(entry."id") AS all_existing_entries
FROM "teacher_assignments" AS assignment
LEFT JOIN "timetable_entries" AS entry
  ON entry."assignmentId" = assignment."id"
GROUP BY assignment."schoolId", assignment."id", assignment."staffId", assignment."classId", assignment."subjectId"
ORDER BY assignment."schoolId", assignment."classId", assignment."staffId";

\\echo '4. Assignments without active timetable entries (lessonsPerWeek will remain NULL)'
SELECT assignment."schoolId", assignment."id", assignment."staffId", assignment."classId", assignment."subjectId"
FROM "teacher_assignments" AS assignment
WHERE NOT EXISTS (
  SELECT 1
  FROM "timetable_entries" AS entry
  WHERE entry."assignmentId" = assignment."id"
    AND entry."isActive" = TRUE
)
ORDER BY assignment."schoolId", assignment."classId", assignment."staffId";

\\echo '5. Timetable and attendance preservation baseline'
SELECT
  (SELECT COUNT(*) FROM "timetable_entries") AS timetable_entry_count,
  (SELECT COUNT(*) FROM "timetable_entries" WHERE "isActive" = TRUE) AS active_timetable_entry_count,
  (SELECT COUNT(*) FROM "attendance_sessions") AS attendance_session_count,
  (SELECT COUNT(*) FROM "attendance_records") AS attendance_record_count;
