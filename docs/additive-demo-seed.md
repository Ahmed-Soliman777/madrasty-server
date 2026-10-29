# Additive demo seed

This seed extends an existing development database. It does not create a school, an administrator, an academic year, a timetable, or timetable entries. It does not delete records or overwrite existing student, guardian, teacher, class, or assignment records.

## Configure local environment

1. Keep the existing legacy seed variables in your local `.env`, including `SEED_SCHOOL_CODE`, the current Mathematics teacher, the guardian shared by the existing siblings, both existing students, and the two existing class definitions.
2. Copy the three `SEED_DEMO_*` lines from `.env.seed.example` into your local `.env`.
3. Replace the synthetic demo values if needed. These are fake development records and demo-only passwords, not real people or production credentials. Never commit your actual `.env`.
4. Confirm `SEED_SCHOOL_CODE` points to a school that already exists, and that the school has a current academic year.

## What the seed adds

- Three bilingual subjects: Mathematics, Arabic Language, and English Language. Existing Mathematics is reused.
- Five additional classes: one more Second Primary class, two Second Middle School classes, and two Second Secondary classes. The existing two classes are preserved.
- Sixty-eight additional students: nine added to each existing class and ten in each new class, giving ten students per class when the existing two students are already present.
- Thirty-four synthetic guardians shared by pairs of new students, in addition to the existing guardian and siblings.
- Eight additional teachers: two Mathematics, three Arabic, and three English teachers. Together with the existing Mathematics teacher, there are three teachers per subject.
- Missing teacher assignments for each class/subject combination. Existing assignments are retained.

The roster uses `LEGACY_CLASS_1` and `LEGACY_CLASS_2` as aliases for the existing class names configured in `.env`.

## Run and verify

Run against a disposable development database first:

```bash
npx prisma validate
npx prisma generate
npx prisma db seed
```

Run the seed a second time to confirm idempotency. Existing records should remain intact and no duplicate configured students, teachers, classes, guardians, subjects, or assignments should be created.

The seed deliberately leaves the timetable untouched: it does not create a new timetable or any timetable entries. It also does not delete any timetable data that may already exist.
