# Architecture

How the system works and why. Each section has a status: **implemented** (the description matches
the code) or **plan (phase N)** — an agreed design that is refined in the phase's spec. When a
phase is closed, its sections are brought in line with the code and get the "implemented" status.
The reasons for the choices and the rejected options are in [decisions.md](decisions.md), the
phases are in [roadmap.md](roadmap.md).

## Processes

```text
browser ──► frontend (Vite; in e2e — nginx, :5173) ──/api──► backend (Django + DRF under uvicorn, :8000) ──► PostgreSQL
                                                                                                           ▲
                                                                worker (manage.py run_worker) ─────────────┘──► SMTP (Mailpit)
```

- **Implemented:** `frontend`, `backend`, `postgres` in docker compose; the frontend and `/api`
  are on one address (Vite proxy), so the session cookie and `EventSource` work without CORS.
- **Implemented (phase 2):** `worker` — the same image as `backend`, a different `command`;
  `mailpit` — an SMTP trap with a web UI and an API on :8025.
- **Implemented (phase 4):** the nginx gateway — the `gateway` stage in `frontend/Dockerfile`:
  `vite build` and nginx on the same port as the dev server; serves the build (an unknown path
  gets `index.html`), proxies `/api`, `/admin`, `/static` to the backend with the client's `Host`
  (Django static files are served by WhiteNoise). The stage is chosen by `FRONTEND_TARGET`:
  `make up` — `dev` (Vite), `make e2e`, `stack-e2e` and CI — `gateway`, so e2e goes through the
  proxy, as in production. Proxy buffering is the default, there is no compression; the stream
  bypasses buffering with the `X-Accel-Buffering: no` header; the default read timeout (60 s) is
  longer than the heartbeat (15 s). The difference from the original plan (the gateway as the
  entry of `make up`, `proxy_buffering off`) — the phase spec, "Assumptions", items 3 and 4.

## Authentication

- **Implemented:** a custom `accounts.User` model — login by email, the email is stored in lower
  case, dots and `+tag` are significant. Participants have no accounts.
- **Implemented:** the Django admin (`/admin/`) — login by email for `is_staff`; static files are
  served by WhiteNoise in all environments. Every model of our apps is registered in the admin (a
  test checks it); models that change only through services are read-only. An Event can be
  created in the admin (the date is in the future, as in the API), but for an existing event
  `organizer`, `starts_at` and `capacity` are read-only: the date and the limit are changed by the
  organizer's `PATCH` through `update_event` — with a lock, emails and promotion from the waitlist
  (phase 5); `schedule_version` is always read-only in the admin. The admin does not delete an
  event with registrations: the cascade would touch the registrations, and they are read-only.
- **Implemented:** organizer login (`/api/auth/login|logout|me/`) — a Django session + CSRF
  (`SessionAuthentication`). The frontend reads the `csrftoken` cookie and passes its value in the
  `X-CSRFToken` header of modifying requests — in `shared/api/csrf.ts`, one place for all calls.
  Who is logged in is known by `entities/session` (`GET me`, a guest is `null`); the router guard
  (`app/router.ts`) sends a guest from `requiresAuth` routes to `/login`, and a logged-in user from
  `/login` to `/org/events`. A guest goes to `/login?next=<path>` and returns to the path after
  login; `safeNext` (`shared/lib/safe-next.ts`) accepts only a path of this application (phase 6).
  A 401 in the middle of a session makes `me` `null`, the current navigation is repeated, and the
  guard decides (`app/session-expiry.ts`). Login and logout drop the previous user's data
  (`forgetUserData`). A participant manages the registration through a secret link with the
  `manage_token` from the email.

## Data model

**User** — implemented (see above).

**Event** — implemented (phase 1; `schedule_version` — phase 5):

- `organizer` (FK → User), `title`, `description`, `starts_at` (timestamptz, UTC), `capacity`
- `schedule_version` (int, `default=1`) — incremented on each reschedule in `update_event` and by
  nothing else; part of the dedup keys of reschedule emails and reminders.

**Registration** — implemented (phase 1, stage 3; the `registrations` app; `checked_in_at` —
since phase 3):

- `event` (FK), `email` (in lower case), `name`
- `status`: `confirmed` / `waitlisted` / `cancelled`
- `queued_at` — the order on the waitlist
- `confirmed_at` — the moment the seat was obtained (needed for the reminder rule)
- `ticket_code` — short, unique, without look-alike characters (`0/O`, `1/I`); shown at the
  entrance
- `manage_token` — a long secret for the "my ticket / cancel" link
- `checked_in_at`, `cancelled_at`; `CHECK (checked_in_at IS NULL OR status = 'confirmed')` — a
  checked-in ticket is never cancelled or on the waitlist
- `UNIQUE(event, email)`; registering again after a cancellation "revives" the row: the seat or
  the waitlist is decided anew (`queued_at` is updated — the tail of the queue), a new
  `ticket_code` is issued, `manage_token` stays the same: the link from the old email manages the
  new registration too.

**OutboxEmail** — an email queue in Postgres, implemented (phase 2; the `emails` app):

- `kind`: `ticket` / `waitlisted` / `promoted` / `rescheduled` / `reminder` (`CHECK`; the last
  two — phase 5)
- `registration` (FK, `CASCADE`), `dedup_key UNIQUE`, `to`, `subject`, `body`, `status`
  (`pending` / `sent` / `failed`; `CHECK`), `attempts`, `next_attempt_at`, `created_at`,
  `sent_at`, `last_error`; an index on `(status, next_attempt_at)` — the worker's selection
- Created in the same transaction as the business change: `enqueue_email(kind, registration)` for
  `ticket` and `promoted`, `enqueue_waitlisted(registration, position)` — the position is required
  at the type level; `enqueue_rescheduled(registration, old_starts_at)` and
  `enqueue_reminder(registration)` — phase 5. The insert is `ON CONFLICT DO NOTHING`.
- The subject and body are a snapshot at the moment of the change: sending does not re-read the
  registration.
- `dedup_key = "{kind}:{registration_id}:{ticket_code}"` for `ticket`, `waitlisted`, `promoted`:
  repeating the same change gives no email, a revival after a cancellation (a new `ticket_code`)
  does. For `rescheduled` and `reminder` — `"{kind}:{registration_id}:{schedule_version}"`: one
  email per reschedule and one reminder per event date.
- Read-only in the admin: `attempts` and `last_error` are visible.

## Invariants and concurrency

**Implemented (phase 1)** — `registrations/services.py`, rules — `docs/rules/concurrency.md`:

- **Registration:** a transaction, `SELECT … FOR UPDATE` on the Event, a count of `confirmed` →
  `confirmed` or `waitlisted`. Registrations for one event run strictly one at a time — two people
  will not take one seat or insert one email twice. `queued_at` is taken after the lock and is no
  earlier than the event's last `queued_at` (+1 µs), so the waitlist order is the lock order even
  if the clock jumped back. `UNIQUE(event, email)` is a safety net for a path without the lock; the
  code does not catch `IntegrityError`.
- **Cancellation:** the same lock; the cancellation and the promotion of the first one on the
  waitlist (`ORDER BY queued_at, id`) are in one transaction.

**Implemented (phase 2):** emails are put into the outbox in the transaction and under the Event
lock: `register` — `ticket` or `waitlisted` with the position counted under the lock; `cancel` —
`promoted` to the promoted one. There is no SMTP inside the lock — only the worker sends
(`concurrency.md`, "Code", item 5). Two workers do not take the same email: `SKIP LOCKED`
(item 6).

**Implemented (phase 3)** — `check_in` in `registrations/services.py`:

- **Check-in:** one conditional
  `UPDATE … WHERE event = ? AND ticket_code = ? AND status = 'confirmed' AND checked_in_at IS NULL`
  in a transaction, then a read of the row. `UPDATE` locks the row, so of simultaneous requests
  with one code the first passes, the others wait for its commit and answer "already checked in"
  with the time of the first check-in. The reason for 0 rows is taken from `checked_in_at`, not
  from the status: checked in → a repeat, not checked in → "the ticket is not confirmed" (waitlist
  or cancellation), no row → "not found". The code is accepted in any case, with spaces and
  hyphens.
- **Cancelling a checked-in ticket is forbidden:** `cancel` takes the registration row
  `FOR UPDATE` under the Event lock, so a check-in and a cancellation of one row go one at a time,
  and a checked-in ticket gives `TicketCheckedIn` (409). The safety net is the `CHECK` in the model
  (see "Registration").

**Race tests — implemented (phases 1–3):** on a real Postgres, N threads with
`threading.Barrier` — `registrations/tests/test_concurrency.py` (including a check-in of one code
and a check-in against a cancellation), `emails/tests/test_concurrency.py`.

**Implemented (phase 5)** — `update_event` and `enqueue_reminders` in `registrations/services.py`:

- **Event change:** the Event lock, then only the sent fields are applied; a field with its
  current value is not a change. A new date means `schedule_version + 1` and a `rescheduled` email
  to each `confirmed` and `waitlisted` one in the same transaction: the email goes out if and only
  if the reschedule is committed. A limit below the number of `confirmed` →
  `CapacityBelowConfirmed`, nothing changes (including the other fields of the request); a higher
  one promotes the first ones from the waitlist with `promoted`, as in `cancel`. Simultaneous
  changes go one at a time, each reschedule gets its own version.
- **Reminders:** the pass takes events in the window `FOR UPDATE SKIP LOCKED`: an event held by a
  reschedule (the new date is saved but not committed) is skipped until the next pass instead of
  being read with the old date; two workers split the events instead of waiting for each other.
- **Race tests:** lowering the limit in parallel with registrations, simultaneous limit raises,
  parallel reschedules and a reminder pass during a reschedule (the race window is held, the test
  is deterministic) — `registrations/tests/test_concurrency.py`.

## API

The frontend types are generated from the OpenAPI schema `backend/openapi.yaml`; the order of an
API change — [development.md](development.md#common-tasks).

**Implemented:**

- `GET /api/health/` — 200 `{"status": "ok", "database": "ok"}` or 503.

**Implemented — public (no session or CSRF):**

- `GET /api/events/?period=&page=` — a page of events with the number of free seats (full ones
  stay in the list), the response is `{count, results}` — paged list output is described below;
  `GET /api/events/{id}/` — one event (including a past one: registering for an event that has
  started is not forbidden)
- `POST /api/events/{id}/registrations/` `{email, name}` → 201 (including registering again after
  a cancellation) / 200 (a repeat) `{status, position?}`; the ticket code is not in the response —
  it comes only by email, otherwise anyone would get someone else's ticket by entering their email.
  No seats → `waitlisted` and `position` (the place on the waitlist; only for `waitlisted`)

- `POST /api/tickets/{manage_token}/cancel/` → 200 `{status: "cancelled"}` / 404 (unknown token) /
  409 (the ticket is already checked in, phase 3); a repeat gives the same 200 without a
  promotion; the promoted one gets a `promoted` email. The participant gets the token only by
  email, tests take it from the database

- `GET /api/tickets/{manage_token}/` → 200
  `{status, ticket_code?, position?, name, checked_in_at, event: {id, title, starts_at}}` / 404
  (unknown token); `ticket_code` — only for `confirmed`, `position` — only for `waitlisted`. The
  read is done without the event lock: a promotion between two requests gives an outdated position
  until the next read

**Implemented — SSE streams (phase 4):** `text/event-stream`, the first message is a snapshot with
`retry: 3000`, then a snapshot on each change of the event's counters and `: ping` after 15 s
without a snapshot. A snapshot is the body of `GET` of the same event; permissions and errors are
the same as for it, at connection time.

- `GET /api/events/{id}/stream/` — a public event with free seats; 404
- `GET /api/org/events/{id}/stream/` — an organizer's event with counters; 401 / 403 / 404

**Paged event lists (phase 6)** — `/api/events/` and `/api/org/events/`: `period=upcoming`
(default; `starts_at` in the future, nearest first) or `past` (`starts_at` has already come,
recent first; an event has no end time); with equal `starts_at`, upcoming ones put the larger `id`
higher, past ones the smaller: past is the same order turned back in time. 20 per page, `page`
from 1; `count` is the number of events in the period; past the end — `results: []` with the same
`count`; an invalid `period` or `page` (< 1, > 1,000,000) — 400 with the field code.

**Implemented — organizer, session + CSRF:**

- `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`
- `GET/POST /api/org/events/` (phase 1; the list has `confirmed` / `waitlisted`); `GET` —
  `?period=&page=`, the response is `{count, results}` (phase 6)
- Phase 3; for all `/api/org/events/{id}/…` an event of another organizer is 403, a nonexistent
  one is 404:
  - `GET /api/org/events/{id}/` — the event and the counters `confirmed`, `waitlisted`,
    `checked_in`, `free_seats`, `cancelled` (phase 4); one query
  - `GET /api/org/events/{id}/registrations/?status=&page=` — registrations in queue order
    `{id, name, email, status, position?, checked_in_at}`, 50 per page (phase 4; past the end —
    `[]`, `page` < 1 or > 1,000,000 — 400); `position` is the place on the waitlist for
    `waitlisted` (a window function in the same query); the filter does not shift the positions;
    an unknown status — 400
  - `POST /api/org/events/{id}/checkin/` `{code}` → 200
    `{result: "checked_in" | "already_checked_in", name, masked_email, checked_in_at}` / 404 (the
    event has no such code) / 409 (the ticket is not confirmed: waitlisted or cancelled) / 400
    (an empty code)

**Implemented — organizer (phase 5):**

- `PATCH /api/org/events/{id}/` — any subset of `title, description, starts_at, capacity` → 200
  with the body of the event's `GET`. 400: the fields are validated as on creation; `starts_at` in
  the past is `past` only if the date changes (an event that has started can be renamed by sending
  its date too); `capacity` below the confirmed count — `below_confirmed`; 401 / 403 / 404 — as
  for the other `/api/org/events/{id}/…`. The view is in `registrations` (`OrgEventView`): emails
  and promotion are there, and `events` does not import `registrations`.

## Realtime

**Implemented (phase 4)** — `events/realtime.py`, details and decisions — the spec in
`docs/features/realtime/`:

- SSE + Postgres `LISTEN/NOTIFY`: `register` (a new and a revived registration), `cancel` (with a
  promotion — one notification), the first `check_in` and any event change in `update_event`
  (phase 5: the snapshot contains the whole event) call `pg_notify('event_stats', event_id)` in
  their transaction; the notification is delivered only after the commit, a rollback cancels it,
  repeats without changes do not notify.
- The backend runs under ASGI (uvicorn); one `LISTEN` connection per process — from the first
  subscriber until the last one leaves. A snapshot is read once per event and notification and
  handed to all subscribers of the process (a queue of one: a new snapshot replaces an unsent
  one); streams do not hold a database connection between changes. A break of the listener's
  connection closes all streams of the process: clients reconnect and get a snapshot.
- The full snapshot goes over the network, not a delta; on (re)connection — a snapshot read right
  after subscribing; heartbeat 15 s; `retry: 3000`.
- The `X-Accel-Buffering: no` and `Cache-Control: no-cache` headers, the stream is not compressed.
- There is no fallback polling. Frontend (`shared/lib`): `LiveSource` — data from the server not
  tied to a transport, `sseSource` — on `EventSource`, `useLive` — a subscription for the
  component's lifetime (again when the page returns from bfcache). A break is reconnected by
  `EventSource` itself; a stream closed by a non-200 response is reopened after 3 s, and the page
  re-reads the event as a probe (without writing to its cache): 401 — `/login`, 403/404 — the
  answer on the page, the stream is closed. The organizer's panel shows the "Connection lost,
  reconnecting…" indicator until the next snapshot.

## Background jobs and emails

A separate process `manage.py run_worker`, a loop:

1. **Sending — implemented (phase 2):** `emails.services.process_batch()` — in one transaction
   `SELECT … FOR UPDATE SKIP LOCKED` of up to 20 `pending` emails with `next_attempt_at ≤ now`
   (by `next_attempt_at, id`) → SMTP one by one, each email with its own connection, timeout
   `EMAIL_TIMEOUT = 10` s → `sent` + `sent_at`. Any exception while sending is a failed attempt:
   `attempts += 1`, `last_error`, `next_attempt_at = now + 30 s · 2^(attempts−1)`, on the 5th —
   `failed`; the other emails of the batch go out. The log gets the email `id` and the error class
   (an error not from `OSError` — `ERROR` with a stack trace), without the text: it may contain an
   address. `SKIP LOCKED` lets several workers run without duplicates. The command
   (`Command.poll()`): an empty batch — a 1 s pause; `DatabaseError` — a log entry,
   `close_old_connections()` and a 5 s pause, the process does not exit.
2. **Reminders — implemented (phase 5):** `registrations.services.enqueue_reminders()` in one
   transaction: events with `starts_at − 24h ≤ now < starts_at` (`FOR UPDATE SKIP LOCKED`) → a
   `reminder` email to each `confirmed` one with `confirmed_at < starts_at − 24h` who does not have
   an email with the key `reminder:{reg_id}:{schedule_version}` yet; returns the number queued.
   Nothing is scheduled in advance, so a restart and a reschedule break nothing, and a worker that
   was down during the window catches up while the event has not started. The worker runs the pass
   in `Command.remind()` before the sending batch, no more often than once every 30 s
   (`REMINDER_INTERVAL`, `time.monotonic()`); a failed pass is retried after the same interval and
   does not stop sending: a database error — a warning and `close_old_connections()`, any other —
   `ERROR` with the class and stack trace, without the text.
3. **Cleanup** of sent emails older than N days — not planned: a Non-Goal of phase 2, in "Later"
   of `docs/features/emails/tasks.md`.

| kind          | To whom                                                                        | When                               |
| ------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| `ticket`      | got a seat on registration                                                     | once                               |
| `waitlisted`  | got onto the waitlist; the position "at the time of the email" + a manage link | once, on getting onto the waitlist |
| `promoted`    | promoted from the waitlist                                                     | once                               |
| `reminder`    | `confirmed`, the seat was obtained before the 24-hour window started           | once per event date                |
| `rescheduled` | `confirmed` and `waitlisted`                                                   | once per reschedule                |

The `ticket`, `waitlisted`, `promoted` emails are implemented (phase 2), `rescheduled` and
`reminder` — phase 5: plain text in English (phase 8), the templates are
`emails/templates/emails/en/<kind>.txt`, the subjects — `SUBJECTS` in `emails/services.py`; the
Russian ones (`ru/`) are kept for a later language switch and are rendered only by a test.
All have the event title and date (UTC, "31 Oct 2026 09:15 UTC") and the link `{FRONTEND_URL}/tickets/{manage_token}`.
`rescheduled` — was / now; to a confirmed one — the code, to one on the waitlist — "you are on the
waitlist" without the position (the position gets outdated, the link shows the current one).
`reminder` — the date and the code, without "in a day": a reminder may go out later in the window
(a reschedule into it, a worker after downtime). Emails are rendered both by the backend and by the
worker (reminders), so `FRONTEND_URL` is set for both.

- Registering again with the same email sends no emails.
- Email: Mailpit in compose, `locmem` in unit tests; e2e reads emails through the Mailpit API.
- An email is created exactly once (`UNIQUE dedup_key`); delivery is "at least once": a worker
  crash between SMTP and writing `sent` gives a repeat (stated in the README).

## Frontend: screens

- **Implemented:** the service status (`/health`), organizer login, event creation, the
  organizer's event list; the public event list (`/`) and the event page with registration
  (`/events/:id`: the result is "seat confirmed" or "you are on the waitlist, #N"). The ticket page
  from the email link (`/tickets/:token`): the code, "you are on the waitlist, #N" or
  "registration cancelled" with a link to the event; "ticket not found"; cancellation with a
  confirmation; a ticket checked in at the entrance — "you were checked in at HH:MM" without
  cancellation (phase 3). The organizer's event panel (`/org/events/:id`, phase 3): counters of
  seats, confirmed, waitlisted, arrived and free seats, a table of participants in queue order
  with a status filter in the URL. The check-in screen (`/org/events/:id/checkin`, phase 3): a code
  field, a large answer in place of the form — "admitted" with the name and a masked email,
  "already checked in at HH:MM", "ticket not found", "ticket not confirmed" — and "Next"; check-in
  works without the event title. Phase 4: the organizer's event is the `/org/events/:id` layout
  with one `GET`, a stream, a header (title, date, counters) and the "Participants" and
  "Check-in" tabs; the counters are live, on a break — "Connection lost, reconnecting…"; the
  participant table has 50 per page (`?page=`), a snapshot with other counters shows "There are
  updates" with a "Refresh" button. The event page has a live number of free seats. Phase 5: the
  "Edit" tab of the event layout (`/org/events/:id/edit`) — the creation form (the shared model is
  `entities/event`) with the current values; only the changed fields are sent, without changes the
  button is disabled; a date change asks for confirmation with the number of email recipients
  (without participants — no confirmation); "At least the confirmed count: N" when the limit is
  lower; the header and counters are refreshed after saving by the stream snapshot.
- **Implemented (phase 6):** the shared layout `app/ui/AppLayout.vue` — a header and one `<main>`
  around `RouterView`. The header has "Events", "Organizer login" for a guest, and for a logged-in
  user "My events", the email (from `sm`) and "Log out" (`POST logout` → `/`); the current page is
  highlighted and has `aria-current="page"` (`shared/ui/nav-link`). Without network — a "No
  internet connection" bar under the header. Request states — `QueryState`
  (`shared/ui/query-state`): "Loading…", an error with "Retry" and "Service status" (`/health`) in
  place of data that is not there yet, or an alert above the previous data; "not found" and "no
  access" — `ErrorState` / `NotFound` (`shared/ui/error-state`), an unknown address — the
  `notFound` route last. The `/` and `/org/events` lists have the "Upcoming" / "Past" tabs
  (`?period=past`, `shared/ui/filter-link`) and pages of 20 (`?page=`, `shared/ui/page-nav`; past
  the end — "No events here" with a link to the last page); the participants have the same page
  bar. The event forms have a description `textarea` and a character counter
  (`shared/ui/char-counter`); a long description is collapsed to 4 lines
  (`shared/ui/expandable-text`). Check-in — "Next" is disabled for 1 s after an answer; the
  check-in time has the date if it is not today. Every screen fits into 360 px without horizontal
  scrolling (e2e `screens-fit-phone`).

## Environment and demo data

- **Implemented:** `make up` starts `postgres`, `backend`, `frontend` with healthchecks, `mailpit`
  and `worker` (phase 2; the worker waits for a healthy `backend` and `mailpit`).
- **Implemented:** demo accounts — the idempotent `create_demo_users` command, `make demo-users`
  after `make up` (`make e2e` calls it itself); it does not run at `backend` start and does not
  change a password that already matches — the sessions of the demo accounts survive a restart.
  Two separate accounts, the roles are not combined:
  - the organizer `demo@example.com` / `demo` — the organizer screens; the reviewer and e2e log in
    with it; no `is_staff`;
  - the administrator `admin@example.com` / `admin` — only the Django admin (`is_staff`,
    `is_superuser`).

  For a local demo only: the passwords are known, and the README says so.

- **Implemented (phase 5):** `make seed` (`seed_demo`, only with `DEBUG`; creates the demo accounts
  itself) — on each run adds to the demo organizer an event in a week with 2 seats (2 confirmed,
  1 on the waitlist) and an event in ~23 h with 10 seats and 3 participants whose `confirmed_at` is
  2 days earlier (the titles start with "Demo"). Registrations go through `register`; ~30 s later
  there are three reminders in Mailpit. Not idempotent: the "tomorrow" event gets outdated within a
  day, a new run gives a fresh one.
