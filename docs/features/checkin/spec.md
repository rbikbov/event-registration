# Check-in and organizer statistics: spec

Phase — `docs/roadmap.md`, phase 3. Status: approved 2026-10-31.

## What and why

Covers from `docs/task.md` "a ticket with a code and a check-in screen at the entrance" and "a
ticket passes check-in once", as well as the organizer's counters (live updates — phase 4). The
organizer enters the code from the ticket and gets a large answer; on the event panel they see the
counters and the participants. A check-in is one atomic change of a row, so simultaneous requests
with one code give exactly one success. Cancelling a checked-in ticket is forbidden (decision of
2026-10-31 06:09). The starting point is "Invariants and concurrency" and "API" in
`docs/architecture.md`; the spec changed the check-in response ("Assumptions", item 1),
`architecture.md` is brought in line with the spec.

## Non-Goals

- Live counter updates, SSE — phase 4: the panel re-reads the data when opened.
- Undoing a check-in, a manual check-in by name, a QR scanner — entry by code only.
- A check-in window by the event time: one can check in at any moment.
- Editing an event and its limit — phase 5. Paging, search, sorting of the participant list.
- Promotion from the waitlist on a no-show, exporting the list.

## Data model

- **Registration**: `checked_in_at` timestamptz null. `CHECK (checked_in_at IS NULL OR
status = 'confirmed')` — a checked-in ticket is never cancelled or on the waitlist. The
  migration adds a nullable field and the constraint; the existing rows satisfy it.
- The "arrived" counter — `confirmed` with `checked_in_at IS NOT NULL`, in
  `EventQuerySet.with_registration_counts()` next to `confirmed` and `waitlisted`.

## Invariants

| Invariant                               | What protects it                                                                                                                                                                                           | Test                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| a ticket is checked in once             | `UPDATE … SET checked_in_at = now WHERE event = ? AND ticket_code = ? AND status = 'confirmed' AND checked_in_at IS NULL`: the row is locked, the second request re-reads it and does not pass the `WHERE` | race: N threads → one `checked_in`, the others `already_checked_in`                   |
| a checked-in ticket cannot be cancelled | under the Event lock `cancel` also takes the registration row `FOR UPDATE`; `checked_in_at` → refusal. A check-in and a cancellation of one row go one at a time                                           | a check-in against cancellation race: exactly one success, the outcome agrees with it |
| only `confirmed` is checked in          | the `UPDATE` condition + a `CHECK` in the database                                                                                                                                                         | pytest, a constraint test                                                             |

## API

| Method and path                                      | Input                         | Response                                                                                                      | Errors (status → `kind`)                                                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/org/events/{id}/checkin/`                 | `{code}`                      | 200 `{result: "checked_in" \| "already_checked_in", name, masked_email, checked_in_at}`                       | 400 → `validation` (an empty code); 403 → `forbidden` (an event of another organizer); 404 → `not_found` (no event or the event has no such code); 409 → `conflict` (the ticket is on the waitlist or cancelled) |
| `GET /api/org/events/{id}/`                          | —                             | 200 `{id, title, description, starts_at, capacity, confirmed, waitlisted, checked_in, free_seats}`            | 403 → `forbidden`; 404 → `not_found`                                                                                                                                                                             |
| `GET /api/org/events/{id}/registrations/?status=`    | `status` — an optional filter | 200 `[{id, name, email, status, position?, checked_in_at}]` by `queued_at, id`; `position` — for `waitlisted` | 400 → `validation` (an unknown status); 403 → `forbidden`; 404 → `not_found`                                                                                                                                     |
| `POST /api/tickets/{manage_token}/cancel/` (phase 2) | —                             | as before                                                                                                     | new: 409 → `conflict` — the ticket is checked in; the registration does not change                                                                                                                               |
| `GET /api/tickets/{manage_token}/` (phase 2)         | —                             | a new field `checked_in_at` (null if not checked in)                                                          | as before                                                                                                                                                                                                        |

- The organizer endpoints — session + CSRF. An event of another organizer — 403, a nonexistent one
  — 404: the event's existence is not a secret, `GET /api/events/{id}/` is public.
- The code is normalized on the backend: upper case, without spaces and hyphens. A code not in the
  format — 404, like an unknown one.

## UI

- **The event panel** `/org/events/:id` (from the organizer's event list): the title, the date,
  the counters "seats / confirmed / waitlisted / arrived / free", a "Check-in" link, a table of
  participants with a status filter. States: loading, error, "not found", an empty list.
- **Check-in** `/org/events/:id/checkin`: a code field with focus, submit on Enter; the field is
  read-only and the button is disabled during the request. The answer is large, in place of the
  form, until the organizer presses "Next" (the button is focused, Enter presses it; then the empty
  field is focused): "Admitted — Name, iv\*\*\*@gmail.com" (green), "Already checked in at HH:MM —
  Name" (yellow), "Ticket not found" (red), "Ticket not confirmed: waitlist or cancellation" (red).
  A failed request is not an answer: an alert above the form, the code stays in the field for a
  retry; "No connection, try again" (`network`), "This event belongs to another organizer"
  (`forbidden`).
- **The ticket page** (phase 2): a checked-in ticket — "You were checked in at HH:MM", no cancel
  button; a cancellation got a 409 (checked in while the page was open) — the same state after a
  re-read.
- The time HH:MM is in the browser's time zone.

## Edge cases

- A code of another event of the same organizer — 404 "not found": the ticket is not for this
  event.
- Promoted from the waitlist: before the promotion their code is 409, after it — passes. A code
  from before a revival after a cancellation (the old `ticket_code`) — 404: the revival issues a
  new one.
- A repeated check-in of the same ticket — `already_checked_in` with the time of the first
  check-in, without changing the row.
- A double Enter — one request (the button and Enter are disabled until the answer).

## Assumptions and open questions

1. **Differs from `architecture.md`:** there "already checked in" is 409, "not confirmed" is 422.
   Here "already checked in" is 200 with `result: "already_checked_in"`, and "not confirmed" is 409. Why: for the check-in screen a repeat is a normal answer with data (the name, the time of
   the first check-in); `unwrap` on the frontend does not return the error body, and `AppError`
   would have to be extended for one field. 422 → `kind: validation` means an error in the form,
   and here it is the ticket's state, which is a `conflict`. On approval `architecture.md` is fixed
   by the spec.
2. Someone else's event — 403, not 404 (the human's decision): the event exists but is not yours;
   there is nothing to hide — `GET /api/events/{id}/` is public.
3. The participant list without paging: the demo scale is dozens of rows.
4. The check-in response has the name and an email with a mask built on the backend (the human's
   decision): `iv***@gmail.com` — the first two characters of the mailbox name (one for a mailbox
   shorter than three), the whole domain. The full address does not go to the screen at the
   entrance that the queue sees, and the mask helps tell namesakes apart. The full email is in the
   participant table on the panel.

## Acceptance scenarios

| Scenario                                                                                                                 | Test level       |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Given `confirmed` When its code is checked in Then `checked_in`, `checked_in_at` is written                              | pytest           |
| Given a checked-in one When checked in again Then `already_checked_in` with the previous time                            | pytest           |
| Given `waitlisted` / `cancelled` When checked in Then 409; Given a code of another event Then 404                        | pytest           |
| Given N threads with one code Then exactly one `checked_in`                                                              | pytest, Postgres |
| Given a checked-in one When cancelled Then 409, the status and the waitlist do not change                                | pytest           |
| Given a check-in and a cancellation at the same time Then exactly one success, the `CHECK` holds                         | pytest, Postgres |
| Given an event with participants When the panel Then counters and a table; a status filter                               | pytest, Vitest   |
| Given the check-in screen When answers 200 / 404 / 409 / network Then each its own large answer                          | Vitest           |
| Given a ticket from an email When checked in twice Then "admitted", then "already checked in"; "arrived: 1" on the panel | e2e              |
