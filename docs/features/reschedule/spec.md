# Reminders and event reschedule: spec

Phase — `docs/roadmap.md`, phase 5. Status: approved 2026-11-02.

## What and why

Covers from the assignment: "a day before the event all participants get a reminder. Exactly one"
and "the organizer rescheduled the event — all participants get an email". Plus the event edit
screen (date, limit, title, description) and `make seed` with demo events. The design is
"Background jobs and emails", item 2, and the event `PATCH` in `docs/architecture.md`; the
decisions about the email rules — `docs/decisions.md`, 2026-10-28 20:07.

## Non-Goals

- Cancelling and deleting an event; an email about a change of the title or description.
- Emails to `cancelled` registrations; a reminder to the waitlisted.
- Lowering the limit below the number of confirmed with moving people to the waitlist — rejected
  (400).
- An event time zone: the dates in emails are UTC, as in phase 2.
- Changing the date and the limit from the admin (they are still read-only there).
- Custom reminder lead times (not 24 h), several reminders, waking the worker on `NOTIFY`.
- Shared navigation, responsive layout — phase 6.

## Data model

- **Event.`schedule_version`** — int, `default=1`, not changed from outside the API. A migration
  with a constant default (Postgres does not rewrite the table).
- **OutboxEmail.`kind`** + `reminder`, `rescheduled`: a new migration replaces the `CHECK`.
- **`dedup_key`** by kind: `ticket` / `waitlisted` / `promoted` — as before
  (`{kind}:{reg_id}:{ticket_code}`); `reminder` and `rescheduled` —
  `{kind}:{reg_id}:{schedule_version}`. Exactly one reminder per event date and one email per
  reschedule.

## Invariants

| Invariant                                                                       | What protects it                                                               | Test              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| One reminder per registration and date                                          | `UNIQUE(dedup_key)` with `schedule_version`, `ON CONFLICT DO NOTHING`          | pytest            |
| A reminder is not about the old date                                            | the reminder selection under the Event lock (`FOR UPDATE SKIP LOCKED`)         | pytest (Postgres) |
| A seat obtained within 24 h — no reminder                                       | the condition `confirmed_at < starts_at − 24h` in the selection                | pytest            |
| Reschedule: an email ⇔ the date is changed and committed                        | `schedule_version += 1` and the emails in one transaction under the Event lock | pytest            |
| The limit is not below the confirmed; a higher limit promotes from the waitlist | the check and the promotion under the Event lock, as in `cancel`               | pytest            |

## Services

`registrations/services.py` (the promotion from the waitlist and the emails are already there;
`events` does not import `registrations`):

- **`update_event(event_id, changes, now)`** — the Event lock; `changes` — only the sent fields.
  `starts_at` differs from the current one → `schedule_version += 1`, a `rescheduled` email to each
  `confirmed` and `waitlisted` (the text: the old and the new date, the code or "on the waitlist",
  the link). `capacity` below the number of `confirmed` → `CapacityBelowConfirmed(confirmed)`,
  nothing changes; higher → promoting the first ones from the waitlist until it is full, each gets
  `promoted`. Any change — `notify_stats_changed`: the stream snapshot contains the whole event.
- **`enqueue_reminders(now)`** — one transaction: events with `starts_at − 24h ≤ now < starts_at`,
  `FOR UPDATE SKIP LOCKED` (a busy event goes to the next pass); each `confirmed` with
  `confirmed_at < starts_at − 24h` without an email with this key gets a `reminder`. Returns the
  number queued.

The worker: `Command.poll()` calls `enqueue_reminders` no more often than once every 30 s
(`REMINDER_INTERVAL`), database errors — as for sending. Nothing is scheduled in advance: a worker
restart and a reschedule break nothing; a worker that was down during the window catches up after
starting, while the event has not started.

## API

| Method and path               | Input                                                   | Response                 | Errors (status → `kind`)                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/org/events/{id}/` | any subset of `title, description, starts_at, capacity` | 200 `OrgEventSerializer` | 400 → `validation` (the fields as on creation; `starts_at` in the past — `past`, only if the date changes; `capacity` < confirmed — `below_confirmed`); 401; 403; 404 |

## Emails

- `rescheduled` — "Event rescheduled: {title}"; was / now (UTC); for `confirmed` — the code, for
  `waitlisted` — "you are on the waitlist" without the position (the position is seen via the
  link); the link.
- `reminder` — "Reminder: {title}"; the date (UTC) without "in a day" (a reminder may go out later
  — a reschedule into the window, a worker after downtime), the code, the link.

## UI

The "Edit" tab in the organizer's event layout (`/org/events/:id/edit`, next to "Participants" and
"Check-in"). The form is the same as for creation (fields, checks, error texts): the shared form
model moves from `pages/org-event-new` to `entities/event`. The fields are filled with the current
values; only the changed ones are sent; no changes — the button is disabled. The date changed —
before sending a confirmation "Participants (confirmed N, waitlisted M) will get a reschedule
email". Saving: the button is disabled, success — "Saved", the header and the counters are updated
by the stream snapshot (the response is not written into the cache: its counters may be older than
the snapshot); a field error — under the field (`below_confirmed`: "At least the confirmed count:
N"), network — a message, the form is not reset.

## Demo data

`make seed` (`manage.py seed_demo`, the agent's slot — `make stack-seed`): each run adds to the demo
organizer (1) an event in a week with 2 seats: 2 confirmed, 1 on the waitlist; (2) an event in
~23 h with 10 seats and 3 participants whose `confirmed_at` is moved 2 days back (the title contains
"демо"). Registrations go through `register` (ticket emails go out too); ~30 s later there are three
reminders in Mailpit. The addresses are `@example.com`.

## Edge cases

- The date is sent but did not change — neither a version nor emails.
- A reschedule into the 24-hour window: participants with a seat from before the new window get
  both the reschedule email and a reminder (it is about the new date).
- A reschedule out of the window to later: the reminder of the old version has already gone out, a
  new one will come before the new date.
- A cancellation, then registering again inside the window — `confirmed_at` is new, no reminder.
- Promoted from the waitlist inside the window — no reminder (the `promoted` email has just come).
- The event has already started: a reschedule into the future is allowed; no reminders for a past
  one.
- Two simultaneous `PATCH` requests — one at a time under the lock; each reschedule has its own
  version and emails.

## Assumptions and open questions

- Lowering the limit below the confirmed — 400, not moving to the waitlist: we take no one's seat.
- `rescheduled` for `waitlisted` without the position: the position in the email gets outdated, the
  link shows the current one.
- Polling reminders once every 30 s: a delay in the demo of up to ~30 s, the query is cheap.
- `make seed` is not idempotent: the "in 23 h" event gets outdated within a day, a new run gives a
  fresh one.

## Acceptance scenarios

| Scenario                                                                                                         | Level             |
| ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| The window is open → one `reminder` to each `confirmed` with a seat from before the window; a repeat — no more   | pytest            |
| A seat obtained inside the window; `waitlisted`; `cancelled`; the event is past → no reminder                    | pytest            |
| A reschedule → `rescheduled` to `confirmed` and `waitlisted`, version +1; then a new reminder about the new date | pytest            |
| A reschedule during a reminder pass → the reminder is not about the old date                                     | pytest (Postgres) |
| A higher limit → the first ones from the waitlist are promoted with `promoted`; below the confirmed → 400        | pytest            |
| `PATCH`: someone else's → 403, missing → 404, a guest → 401, a date in the past → 400                            | pytest            |
| The edit form: filling, only the changed fields, a reschedule confirmation, errors                               | Vitest            |
| The organizer reschedules the event → reschedule emails to a confirmed and a waitlisted one in Mailpit           | e2e               |
| The organizer raises the limit → the waitlisted one gets `promoted` in Mailpit                                   | e2e               |
