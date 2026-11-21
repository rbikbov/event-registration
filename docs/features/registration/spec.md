# Registration, waitlist, cancellation: spec

Phase — `docs/roadmap.md`, phase 1. Status: done.

## What and why

Covers the core of the assignment: the organizer logs in and creates an event; a participant
registers by email and gets a seat or a place on the waitlist; a cancellation frees the seat and
promotes the first one from the waitlist. The invariants — "one email — one seat per event" and "no
more seats than `capacity`" — are held at the database and lock level, not by a check in the code.
The design of the mechanisms is in the "Authentication", "Data model", "Invariants", "API" sections
of `docs/architecture.md`; the spec refines them and changes nothing in them.

## Non-Goals

- Emails and the ticket screen — phase 2. The registration response contains neither
  `ticket_code` nor `manage_token`.
- Editing an event, rescheduling, changing the limit — phase 5. Check-in, the participant list —
  phase 3.
- SSE and live counters — phase 4. The event page gets the free seats with an ordinary request.
- User sign-up, roles, RBAC. Paging, search, list filters.
- Protection against password brute force and registration spam (rate limit), a captcha.
- A ban on registering for an event that has already started.
- Organizer endpoints by event id (`/api/org/events/{id}/`) and `get_org_event(user, id)` with
  404 / 403 — they will appear with the first consumer (event editing, the participant list). In
  phase 1 the organizer sees only the list of their events; the "someone else's" check is
  `for_organizer`.
- An organizer logout button: `POST /api/auth/logout/` exists, the UI for it comes later.

## Data model

The `events` app (a new domain). Migrations follow `docs/rules/db-migrations.md`.

- **Event**: `organizer` FK→User (`PROTECT`), `title` (≤200), `description` (≤2000, may be empty),
  `starts_at` timestamptz, `capacity` (int). `CHECK (capacity > 0)`. `schedule_version` is not
  added in phase 1 — it has no consumer until phase 5.
- **Registration**: `event` FK (`CASCADE`), `email` (lower case), `name` (≤200), `status`
  (`confirmed` / `waitlisted` / `cancelled`, a `CHECK` on the allowed values), `queued_at`,
  `confirmed_at` (null), `cancelled_at` (null), `ticket_code` (unique), `manage_token` (unique),
  `UNIQUE(event, email)`. The `checked_in_at` field will be added by phase 3, emails by phase 2.
- `EventQuerySet.for_organizer(user)` (the list); `RegistrationQuerySet` / `annotate` for the
  counters.
- Admin: Event — creation and editing of the title and description (the date, limit and organizer
  of an existing one are read-only, deleting one with registrations is forbidden), Registration —
  read-only (`backend/AGENTS.md`, item 9).

## Invariants

| Invariant                                             | What protects it                                                                            | Test                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| One email — one registration per event                | `UNIQUE(event, email)` + case normalization                                                 | pytest, service + race                 |
| `confirmed` ≤ `capacity`                              | `SELECT … FOR UPDATE` on the Event in the registration transaction                          | pytest, a race on Postgres             |
| The waitlist goes by `queued_at, id`                  | the order in the promotion query                                                            | pytest, service                        |
| Cancellation and promotion are atomic                 | one transaction, the same Event lock                                                        | pytest, service                        |
| The organizer works only with their own events        | `for_organizer(user)` in the `/api/org/events/` list; by id — with the first endpoint by id | pytest, API, no one else's in the list |
| A repeated cancellation does not promote a second one | cancellation works only from `confirmed`/`waitlisted`                                       | pytest, service                        |

## API

Errors — a 400 carries field codes `{"errors": {field: [code]}}`, the other 4xx — `{"detail": …}`
(decision of 03:21 in `docs/decisions.md`); the frontend maps the status to `AppError.kind`
(`validation` — 400, `unauthorized` — 401, `forbidden` — 403, `not_found` — 404, the rest —
`unknown`/`server`; the frontend shows `forbidden` on someone else's event as "no access", and a
guest (401, including on `me`) is sent to `/login`).

| Method and path                            | Input                                       | Response                                                                  | Errors                          |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| `POST /api/auth/login/`                    | `{email, password}`                         | 200 `{id, email}`, session cookie                                         | 400 wrong credentials           |
| `POST /api/auth/logout/`                   | —                                           | 204                                                                       | 401 without a session; 403 CSRF |
| `GET /api/auth/me/`                        | —                                           | 200 `{id, email}`                                                         | 401 without a session           |
| `GET /api/org/events/`                     | —                                           | 200 `[Event]` (+ `confirmed`, `waitlisted` since stage 3), only one's own | 401                             |
| `POST /api/org/events/`                    | `{title, description, starts_at, capacity}` | 201 Event                                                                 | 400 fields; 401                 |
| `GET /api/events/`                         | —                                           | 200 `[{id, title, starts_at, capacity, free_seats}]`, future ones         | —                               |
| `GET /api/events/{id}/`                    | —                                           | 200 the same + `description`                                              | 404                             |
| `POST /api/events/{id}/registrations/`     | `{email, name}`                             | 201 / 200 (a repeat) `{status, position?}`                                | 400 fields; 404                 |
| `POST /api/tickets/{manage_token}/cancel/` | —                                           | 200 `{status: "cancelled"}`                                               | 404 unknown token               |

Login by session without tokens in JS; the frontend needs `GET /api/auth/me/` to know whether the
user is logged in (the CSRF cookie is issued by `ensure_csrf_cookie` on `me`). `position` — only
for `waitlisted`, counted as the number of `waitlisted` with `(queued_at, id)` no later than one's
own.

## UI

The UI library and design tokens are chosen before the first frontend task (task 1.2) and written
to `docs/decisions.md`; the screens below describe states, not layout.

FSD layers follow the `fsd-frontend` skill; routes are in `app/router.ts`.

- `/login` — a form; a wrong-credentials error; after login — `/org/events`.
- `/org/events` — the list of one's own events (title, date, `confirmed / capacity`, waitlist),
  empty → "no events yet", a "Create" button; unauthorized → `/login`.
- `/org/events/new` — the creation form; field errors from the server; success → the list.
- `/` — the public list of future events with the number of free seats (full ones stay, "no
  seats"); empty / error / loading.
- `/events/:id` — the description, free seats, a `{email, name}` form; the result: "seat
  confirmed" / "you are on the waitlist, #N"; submitting the same email again shows the same
  result; field and network errors; the button is disabled during the request.

## Edge cases

- `A@x.io` and `a@x.io` are one registration; `a.b@x.io` and `ab@x.io`, `a+t@x.io` are different.
- A double click / a repeated request → 200 with the previous result, no second seat.
- A registration after a cancellation "revives" the row: the status and the queue are decided
  anew, a new `ticket_code` is issued, `queued_at` is updated.
- A cancellation from the waitlist promotes nobody; a cancellation from `confirmed` promotes
  exactly one.
- The event is completely full, the waitlist is empty: the first new one is `waitlisted`, #1.
- When `/api/org/events/{id}/` appears: someone else's event → 403 (the event is public, its
  existence is not a secret); a nonexistent one → 404. The `/api/org/events/` list contains only
  one's own. The administrator looks at other organizers' events in the Django admin, where all
  events are visible.

## Assumptions and open questions

- Fields: `title` 1–200, `description` ≤2000, `name` 1–200, `capacity` 1–10000 — reasonable
  limits, not set in the assignment.
- `starts_at` on creation must be in the future (400 otherwise) — events in the past make no
  sense.
- The public list — only future events, by ascending `starts_at`; no paging.
- A repeated registration returns 200 and the current status (idempotency), a new one — 201.
- A cancellation is idempotent: an already cancelled registration → 200 `cancelled`, no side
  effects.
- A wrong login → 400 (not 401), so as not to confuse it with an expired session on the frontend.
- `position` is not stored but computed — otherwise it would have to be recounted on each
  cancellation.

## Acceptance scenarios

| Scenario                                                                                    | Level             |
| ------------------------------------------------------------------------------------------- | ----------------- |
| The organizer logs in; a wrong password → an error; `me` without a session → 401            | pytest, Vitest    |
| Creating an event; no one else's in the list                                                | pytest            |
| Registration with a free seat → `confirmed`                                                 | pytest, Vitest    |
| A repeat, a different email case → one record, no second seat                               | pytest            |
| No seats → `waitlisted`, `position` grows 1, 2, 3                                           | pytest, Vitest    |
| A `confirmed` cancels → the first one from the waitlist is `confirmed`, the others moved up | pytest            |
| A cancellation from the waitlist and a repeated cancellation — no promotion                 | pytest            |
| Race: N threads for the last seat → exactly one `confirmed`                                 | pytest (Postgres) |
| Race: N threads with one email → one record                                                 | pytest (Postgres) |
| The organizer creates an event; a participant registers, sees the result                    | e2e               |
