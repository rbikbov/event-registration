---
name: api-change
description: >
  The procedure of an API change: a backend serializer, view or URL → a test → the OpenAPI schema →
  the frontend types → a call from the frontend. Use when an endpoint, a request or response field,
  or a response status is added or changed. Do not use for logic edits without a contract change.
---

# API change

The API contract lives in three places that change together, in one commit:
the backend code → `backend/openapi.yaml` → `frontend/src/shared/api/schema.d.ts`.

## Order

1. **Test first.** Logic — a function in `<app>/services.py`, the test calls it directly (rule 1 of
   `backend/AGENTS.md`). The endpoint's behavior — a test through `APIClient`: the status, the body,
   permissions. Races and locks — `django_db(transaction=True)` (rule 5).
2. **Serializer and view.** The view is thin: parsing the request, calling the service, the
   response. Domain errors — exceptions of the service that the view translates into a status.
3. **The description for the schema.** A response not from a serializer, several statuses or a
   stream — `@extend_schema` (examples — `backend/config/health.py`, `backend/accounts/views.py`).
   List all the statuses the endpoint really returns, including 4xx.
4. **`make schema`.** It updates `backend/openapi.yaml` and `schema.d.ts`. Do not edit them by hand.
5. **Frontend.** The response type — `components["schemas"]["<Name>"]`, the call — through `api` and
   `unwrap()` from `@/shared/api`. If a field or a path changed, `make check-frontend` fails on
   vue-tsc — that is the contract check (`frontend/AGENTS.md`, rules 2–3).
6. **Check.** `make stack-check` (it includes `schema-check` and vue-tsc; `make check-backend`
   without `POSTGRES_PORT=5433` goes to the human's Postgres).
   The schema and the types — in the same commit as the code.

## What to check on each endpoint

- **Permissions.** An organizer endpoint (`/api/org/...`) requires login (the default permission is
  `IsAuthenticated`; a public view explicitly sets `AllowAny`). The event list — through
  `Event.objects.for_organizer(user)`. There is no endpoint by id yet; when it appears, the event is
  taken through `get_org_event(user, id)` (it does not exist yet): a nonexistent one — 404, someone
  else's — 403 (the decision of 01:17 in `docs/decisions.md`). A test: user A by the id of event B
  gets 403, not the data; a guest — 401.
- **CSRF.** A modifying request of the organizer goes with `X-CSRFToken` (`shared/api/csrf.ts` adds
  it itself). A CSRF test — `APIClient(enforce_csrf_checks=True)`, the example —
  `test_logout_requires_csrf_token`.
  The participant's public endpoints (registration, cancellation by token) do not depend on the
  session.
- **A list.** Counters and related objects — without a query per row; a test with
  `django_assert_num_queries` (rule 10 of `backend/AGENTS.md`).
- **Nothing extra in the response.** The response has no data that gives access to someone else's:
  the ticket code is not returned in the registration response, it comes only by email
  (`docs/architecture.md`, the "API" section).
- **Logs.** No emails, names, codes or tokens (rule 8).

## Errors

The frontend maps the status to `AppError.kind` (`shared/api/app-error.ts`: 400/422 — `validation`,
401 — `unauthorized`, 403 — `forbidden`, 404 — `not_found`, 409 — `conflict`, 5xx — `server`). A
new status — a change of `kindForStatus` and a test. An anonymous request to a closed endpoint — 401
(`accounts.authentication.SessionAuthenticationWith401`: without the `WWW-Authenticate` header DRF
replaces 401 with 403); 403 — "logged in, but not allowed" (someone else's event, CSRF). "Wrong
login" — 400, so as not to confuse it with an expired session.

Field errors (400 `ValidationError`) — codes, not texts: DRF returns English messages, and the
interface has its own texts. `config.exceptions.api_exception_handler` turns the body into
`{"errors": {"field": ["code"]}}` (`exc.get_codes()`: `required`, `blank`, `max_length`,
`min_value`, `invalid`…); an error outside a field (from `validate()`) — under `non_field_errors`.
Our own code for a domain rule — `ValidationError(msg, code="past")`. The form maps the code to a
text in its `<i18n>`; the frontend puts the field codes into `AppError.fields` (task 2.2). It gets
into the 400 schema through `responses={400: ValidationErrorSerializer}` (`config.exceptions`) — set
it on each endpoint with a request body. The other 4xx keep `{"detail": "..."}`.

An example of an endpoint test — `backend/accounts/tests/test_auth_api.py`: `APIClient`,
`force_login`, parametrized bad inputs, the status and the body.

## Done when

- The endpoint test and the logic test pass; `make stack-check` is green.
- `openapi.yaml` and `schema.d.ts` are in the commit; the schema `git diff` has only what is
  expected.
- The change is documented: the endpoint in `docs/architecture.md` (the "API" section) is brought in
  line with the code, the section status is updated.
