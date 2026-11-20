# backend/ — Django + DRF

Commands and tools — `docs/development.md`, the "Backend" section. Here — the rules for the code.

## Structure

- `config/` — settings, root URLs, ASGI and project-level views (`health.py`).
- A Django app is a folder next to `config/` (`accounts/`). A new app — only for a new domain, not
  for one view.
- Tests — in `<app>/tests/test_*.py`, next to the app's code.

## Rules

1. Views are thin: parsing the request, calling the logic, the response. Business logic — functions
   in `<app>/services.py`; logic tests call them directly, without HTTP.
2. Environment variables are read only in `config/settings.py`.
3. An API change — a serializer, a view or a URL — together with `make schema` and a committed
   `openapi.yaml` in the same commit. A response that drf-spectacular does not infer itself (not
   from a serializer, several statuses, a stream) is described with `@extend_schema`; generation
   with `--fail-on-warn` will not let a gap through.
4. The database schema changes only through a migration; the rules — `docs/rules/db-migrations.md`.
   A hook forbids the agent to edit committed migrations.
5. Tests on a real Postgres: `pytest.mark.django_db`; the behavior of transactions and locks —
   `django_db(transaction=True)`. SQLite and ORM mocks are not used to check queries.
6. Time — `django.utils.timezone.now()` or a `now` parameter of a function that needs to be tested
   at a specific moment. `datetime.now()` without a time zone is a bug. A test that checks "the time
   has come" passes `now` explicitly (for example, the latest time in the data) rather than relying
   on the clock not going back between creating a record and the check: in WSL2 it jumps back by
   fractions of a second (`docs/development.md`, "Gotchas"). For the same reason a test that checks
   an order by timestamps sets the timestamps itself.
7. `# type: ignore[code]` — only with an error code and a reason in the same comment. `Any` — at the
   boundary with untyped code, not in our own logic.
8. Logs have no personal data: emails, names, ticket codes, tokens.
9. Each model of an app is registered in the admin in the same commit as the model:
   `config/tests/test_admin.py` fails on an unregistered one. Models that change only through
   services with locks and invariants (registrations, emails) are read-only in the admin:
   `has_add_permission`, `has_change_permission`, `has_delete_permission` return `False`, and a test
   checks it.
   Saving from the admin is a plain `save()`: without a lock, a service and its side effects. So a
   change that needs a lock or side effects is done by the admin through a service: if there is a
   service — it is called from `save_model` / `delete_model`; while there is no service or it is
   decided not to call it — such fields of an existing object are in `get_readonly_fields`. Event:
   the limit and the date are read-only in the admin after phase 5 too — they are changed by the
   organizer's `PATCH` through `update_event` (the `reschedule` spec, Non-Goals); the organizer does
   not change at all, `schedule_version` is always read-only. Checks that are not in the model (a
   date in the future — in the serializer) are repeated in the admin form. Deleting a parent with a
   cascade is checked by the admin against the permissions on the related models: the ban on
   deleting Registration does not let it delete an event with registrations either — this is also
   checked by a test (`events/tests/test_admin.py`).
10. A list and counters — without a query per row: related objects through `select_related` /
    `prefetch_related`, counters through `annotate(Count(..., filter=Q(...)))`, not by a loop over
    the objects. An endpoint with a list is covered by a test with `django_assert_num_queries`: the
    number of queries does not depend on the number of rows.
11. Side effects of business operations (emails, promotion from the waitlist, notifications) — by
    an explicit call inside the service, not by `pre_save` / `post_save` / `post_delete` signals. A
    signal fires outside the service's lock (a save from the admin, a `create` in a test), does not
    fire on `QuerySet.update()` and `bulk_create`, and hides the order of actions in the
    transaction. The path past the service (the admin) is closed by calling the service from
    `save_model` or by read-only fields (item 9), not by a signal.
