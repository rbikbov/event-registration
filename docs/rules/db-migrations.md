# Database migrations

Rules for `backend/*/migrations/`. Checked by: `make migrations-check` (models without a
migration), the agent hook `guard-migrations.mjs` (edits of committed migrations).

## Rules

1. **A committed migration is not edited.** It may have been applied by another developer, in CI
   or on a staging server; an edit makes the schemas diverge. A mistake is fixed by a new
   migration. While a migration is not committed, it can be recreated: delete it and run
   `makemigrations` again.
2. **One migration — one logical change**, with a meaningful name:
   `uv run python manage.py makemigrations <app> --name add_event_capacity`.
3. **Schema and data — in separate migrations.** A data migration (`RunPython`) uses
   `apps.get_model(...)`, not a model import: the model in the code may no longer match the schema
   at the time of the migration. `RunPython` always has a reverse function or
   `migrations.RunPython.noop` if rolling back the data is not needed.
4. **A constraint on existing data** (`unique`, `NOT NULL`, `CHECK`) — first a migration that puts
   the data in order, then the constraint. Otherwise the migration fails on a real database, even
   though it passes in tests (an empty database).
5. **Invariants — in the database, not only in the code:** uniqueness, `CHECK`, foreign keys. A
   check in Python does not protect against a race of two requests; a database constraint does.
6. Migrations are not squashed (`squashmigrations`) and not deleted.
7. Before committing, look at the SQL: `uv run python manage.py sqlmigrate <app> <number>` —
   especially for indexes and type changes on large tables (locks).
