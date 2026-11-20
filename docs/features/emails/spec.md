# Outbox, worker, emails: spec

Phase — `docs/roadmap.md`, phase 2. Status: approved 2026-10-30.

## What and why

Covers from the assignment: "a registered participant gets an email with the ticket" and "someone
cancelled — the first one on the waitlist gets the seat and an email"; plus an email about getting
onto the waitlist with a manage link. The email is created in the same transaction and under the
same Event lock as the registration change, and a separate worker process sends it: SMTP does not
hold the lock and does not bring down a registration. The participant opens the link from the
email — the ticket page with the code, the status and cancellation. The design is "OutboxEmail" and
"Background jobs and emails" in `docs/architecture.md`; the spec refines it in three places (stated
below: a text snapshot, the dedup key, no cleanup).

## Non-Goals

- The `reminder` and `rescheduled` emails, `schedule_version` — phase 5.
- Cleaning up sent emails (step 3 of the worker loop in `architecture.md`) — it has no consumer,
  the outbox volume in the demo is small. In "later".
- HTML emails, attachments, a QR code for the ticket: an email is plain text.
- Waking the worker through `LISTEN/NOTIFY`: the worker polls the outbox once a second.
- Resending `failed` emails from the admin or the API, unsubscribe, spam complaints.
- The participant list and check-in by code — phase 3. Live seats on the page — phase 4.
- A rate limit on `GET /api/tickets/{token}/` (the token is 256 bits, brute force is pointless).

## Data model

The `emails` app. Migrations follow `docs/rules/db-migrations.md`.

- **OutboxEmail**: `kind` (`ticket` / `waitlisted` / `promoted`; `CHECK`), `registration` FK
  (`CASCADE`), `dedup_key` (unique), `to`, `subject`, `body`, `status` (`pending` / `sent` /
  `failed`; `CHECK`), `attempts` (int, 0), `next_attempt_at`, `created_at`, `sent_at` (null),
  `last_error` (text, empty). An index on `(status, next_attempt_at)` — the worker's selection.
- **The text is a snapshot at the moment of the change** (a refinement of `architecture.md`):
  `subject` and `body` are rendered from a template inside the transaction. The place on the
  waitlist and the code are those at the time of the change; sending later does not re-read the
  registration, which may have changed by then.
- **`dedup_key = "{kind}:{registration_id}:{ticket_code}"`** (a refinement): `ticket_code` changes
  on a revival after a cancellation, so registering again after a cancellation gives a new email,
  and a repeat of the same request does not.
- Admin: OutboxEmail is read-only (`backend/AGENTS.md`, item 9) — `attempts` and `last_error` are
  visible there.

## Invariants

| Invariant                                          | What protects it                                                           | Test                             |
| -------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| An email exists ⇔ the change is committed          | queuing the email into the outbox in the `register` / `cancel` transaction | pytest, service (positive cases) |
| One change — one email                             | `UNIQUE(dedup_key)`, the insert is `ON CONFLICT DO NOTHING`                | pytest, service                  |
| A repeated registration sends no emails            | an early return of `register` before `enqueue_email`                       | pytest, service                  |
| No SMTP inside the Event lock                      | sending only in the worker (`concurrency.md`, "Code", item 5)              | review                           |
| Two workers do not send one email at the same time | `SELECT … FOR UPDATE SKIP LOCKED` on the outbox rows                       | pytest (Postgres)                |
| An SMTP error does not lose the email              | `attempts`, `next_attempt_at` with a growing pause, `failed`               | pytest, worker                   |

Delivery is "at least once": a worker crash between SMTP and writing `sent` gives a repeat
(`architecture.md`). The outbox rows are locked while the worker sends their batch; the Event lock
is not held meanwhile.

## Worker

`manage.py run_worker`: a loop — a batch of up to 20 `pending` emails with `next_attempt_at ≤ now`
(`FOR UPDATE SKIP LOCKED`, by `next_attempt_at, id`) → SMTP one by one → `sent` + `sent_at`, or
`attempts += 1`, `last_error`, `next_attempt_at = now + 30 s · 2^(attempts−1)`; after 5 attempts —
`failed`. An empty batch — a 1 s pause. One iteration is the `process_batch()` function, and that
is what is tested; the loop and `sleep` are only in the command.

## API

| Method and path                            | Input | Response                                                                     | Errors (status → `kind`) |
| ------------------------------------------ | ----- | ---------------------------------------------------------------------------- | ------------------------ |
| `GET /api/tickets/{manage_token}/`         | —     | 200 `{status, ticket_code?, position?, name, event: {id, title, starts_at}}` | 404 → `not_found`        |
| `POST /api/tickets/{manage_token}/cancel/` | —     | unchanged (phase 1), now it also creates `promoted` for the promoted one     | 404 → `not_found`        |

`ticket_code` — only for `confirmed`, `position` — only for `waitlisted`. The registration response
does not change: there is no code in it, it comes by email. Without a session and CSRF, like the
other public ones.

## Emails

Plain text, in Russian, the templates are `emails/templates/emails/<kind>.txt`. All have the event
title and date and the link `{FRONTEND_URL}/tickets/{manage_token}` ("my ticket / cancel").

- `ticket` — the ticket code. `promoted` — "a seat became free" + the ticket code.
- `waitlisted` — the place on the waitlist at the time of the email; "if a seat becomes free, an
  email will come".

## UI

The `/tickets/:token` page (`pages/ticket`, the `ticket` entity): loading; 404 → "ticket not
found"; `confirmed` — a large code, the event, a "Cancel" button; `waitlisted` — "you are on the
waitlist, #N", a "Cancel" button; `cancelled` — "registration cancelled" and a link to the event
(to register again). Cancellation asks for confirmation, the button is disabled during the request,
after success the page re-reads the ticket; a network error — a message, the state does not change.

## Environment

- compose: `mailpit` (SMTP :1025, web and API :8025, the port is `MAILPIT_PORT`), `worker` — the
  `backend` image, `command: python manage.py run_worker`, waits for a healthy `backend`
  (migrations).
- Settings from env: `EMAIL_HOST` / `EMAIL_PORT`, `DEFAULT_FROM_EMAIL`, `FRONTEND_URL` (default
  `http://localhost:5173`; compose passes the address with `FRONTEND_PORT`). Tests — `locmem`.
- e2e reads emails through the Mailpit API (`E2E_MAILPIT_URL`, default `http://localhost:8025`);
  each test has its own email, the shared mailbox is not cleaned.

## Edge cases

- A cancellation from `confirmed` with an empty waitlist — no emails; from `waitlisted` — no emails.
- A repeated cancellation — neither a promotion nor an email.
- Cancellation → registering again → a new email with a new code; the link (`manage_token`) stays
  the same.
- Promoted, then cancelled before `promoted` was sent — the email goes out anyway (a snapshot); the
  link shows "cancelled".
- Mailpit is unavailable — the registration passes, the email waits and goes out after Mailpit
  starts.
- An unknown token on the ticket page → "ticket not found", without details.

## Assumptions and open questions

- The date in the email is in UTC marked "UTC": an event has no time zone, and the page from the
  link shows the browser's local time. Rejected: hardcoding a zone in a setting — the choice belongs
  to the organizer.
- 5 attempts, pauses between them 30 s · 2ⁿ (30 s, 1, 2, 4 min) — Mailpit starts in seconds; the
  values are module constants, not env.
- A batch of 20, polling once every 1 s — an email's delay in the demo is up to ~1 s.
- `SIGTERM` of the worker without special handling: an interrupted batch is a rollback or a repeat
  ("at least once").
- A link with a token is a secret: `Referrer-Policy: same-origin` (the Django default), the token is
  not written to the worker logs (the log has the email `id`).

## Acceptance scenarios

| Scenario                                                                                                                  | Level             |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Registration for a seat → one `ticket` email with the code and a link; a repeat — no more emails                          | pytest            |
| Waitlist → `waitlisted` with the position; a `confirmed` cancels → `promoted` to the first one on the waitlist            | pytest            |
| A rolled-back registration transaction → no email (no separate test — `decisions.md`, 2026-10-31 04:23)                   | —                 |
| Worker: `pending` → `sent`; an SMTP error → `attempts`, the pause grows; 5 errors → `failed`                              | pytest            |
| Two workers in parallel → each email is sent once                                                                         | pytest (Postgres) |
| `GET /api/tickets/{token}/` by status; an unknown one → 404                                                               | pytest            |
| The ticket page: code / #N / cancelled / not found; cancellation with a confirmation                                      | Vitest            |
| Registration → an email in Mailpit → the ticket via the link → cancellation → the first one on the waitlist gets an email | e2e               |
