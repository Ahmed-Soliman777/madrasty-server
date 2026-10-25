# Safe timetable migration runbook

This migration is limited to the database/schema foundation. It does not add timetable APIs, change attendance behavior, or enable timetable generation.

## Before applying

1. Point the connection at a staging database restored from a recent production backup.
2. Run the read-only preflight report:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-timetable-migration.sql
   ```

3. Review and retain the results for active teacher-slot and class-slot conflicts, assignments with no active entries, and the attendance baseline.
4. Test that the backup can be restored. Never run `prisma/seed.ts` against production; the current seed deletes operational data.
5. Confirm the deployment uses the same PostgreSQL schema and Prisma migration history expected by this repository.

## What the migration changes

- Adds `lessonsPerWeek` as nullable and backfills it from active existing entries only. Assignments without active entries remain NULL.
- Adds versioned `timetables` and `timetable_generation_jobs` tables.
- Creates one historical `PUBLISHED` timetable per school/academic year represented by existing entries. Historical approver/publication timestamps remain NULL.
- Adds `timetableId` nullable, backfills every existing timetable entry, verifies no entry remains unassigned, and then makes it required.
- Preserves every existing timetable-entry ID and all attendance foreign keys.
- Removes the old cross-version uniqueness constraint so future timetable versions can reuse slots.
- Does not add class/teacher conflict unique indexes yet. Those must wait until legacy conflict results have been reviewed and resolved.

## Apply and verify

Run on staging first:

```bash
npx prisma migrate deploy
npx prisma validate
npx prisma generate
```

Then verify:
- The number of timetable entries and their IDs are unchanged.
- No timetable entry has a NULL `timetableId`.
- Every existing attendance session still resolves to the same `timetableEntryId`.
- Historical timetables exist for every school/year that has timetable entries.
- `lessonsPerWeek` is populated only for assignments with active entries; no-entry assignments remain NULL.
- No unrelated tables or records changed.

Do not apply to production until the staging checks pass and the migration report is reviewed. The migration intentionally does not repair or delete pre-existing conflicts.
