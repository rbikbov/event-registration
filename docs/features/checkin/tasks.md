# Check-in and organizer statistics: tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

The stages are vertical: each ends with something that can be shown in the browser. Inside a stage
— backend → frontend → e2e/docs. Logic — test first; `make stack-check` in each task.

## Stage 1. Checking in a code end to end (tracer bullet)

- [x] 1.1 backend: `checked_in_at` and the `CHECK` (a migration), the `check_in` service — an
      atomic `UPDATE`, `POST /api/org/events/{id}/checkin/` → 200 `checked_in` / 404 along the
      api-change path, code normalization. Done when: the tests "checked in", "unknown code",
      "a code of another event", "someone else's event", "normalization" are green, the schema is
      up to date.
- [x] 1.2 frontend: the `/org/events/:id/checkin` screen — a field, Enter, a large "Admitted —
      Name" and "Ticket not found"; a "Check-in" link from the organizer's event list. Done when:
      Vitest (MSW) for the two answers is green; in the browser the code from the email passes.

## Stage 2. Once: a repeat, an unconfirmed ticket, a cancellation after check-in

- [x] 2.1 backend: `already_checked_in` with the time of the first check-in, 409 for `waitlisted` /
      `cancelled`; a race test with N threads. Done when: the tests are green, the race test fails
      without the `checked_in_at IS NULL` condition.
- [x] 2.2 backend: `cancel` of a checked-in one → 409 (the registration row `FOR UPDATE` under the
      Event lock); `checked_in_at` in the ticket response; a check-in against cancellation race
      test. Done when: the tests are green, the race test fails without the row's `FOR UPDATE`.
- [x] 2.3 frontend: on the check-in screen — "Already checked in at HH:MM", "Not confirmed", "No
      connection", blocking a double submit; on the ticket page — "You were checked in at HH:MM"
      without a cancel button, a 409 on cancellation → a re-read. Done when: Vitest for the states
      is green.

## Stage 3. The event panel

- [x] 3.1 backend: `GET /api/org/events/{id}/` with the counters (`checked_in` in
      `with_registration_counts`), `GET /api/org/events/{id}/registrations/?status=`. Done when:
      the tests of the counters, the filter, a 400 on an unknown status, a 404 on someone else's
      are green.
- [x] 3.2 frontend: the `/org/events/:id` panel — counters, a table with a filter, a link to
      check-in; the transition from the event list. The check-in screen loads the event: the title
      in the heading, a nonexistent one — "Event not found" instead of an answer about the ticket
      (the stage 1 review, finding 2). Done when: Vitest for loading, an error, an empty list and
      the filter is green.

## Stage 4. E2E and closing

- [x] 4.1 e2e: registration → the code from the email in Mailpit → check-in "admitted" → a repeat
      "already checked in" → "arrived: 1" on the panel. Done when: passes in `make stack-e2e`.
- [x] 4.2 closing the phase: `architecture.md` (check-in, API, screens — "implemented"), README
      ("State", "requirement → test"), the roadmap. Done when: the phase criteria are verified with
      facts.

## Log

- The base of stage 1 — `d4a390c` (`main` after merging PR #11).
- The base of stage 2 — `c96405a` (`main` after merging PR #12), the `feat/checkin-once` branch.
- Stage 2: the review — one finding (the decision on it — `decisions.md`, the fix `b49ca49`), the
  repeated review — no findings. A pass in Chromium on slot 1 (a Playwright script): code A in
  lower case with a hyphen and a double Enter — one request, "Admitted — Anna,
  a-\*\*\*@example.com"; a repeat — the yellow "Already checked in at HH:MM"; the code of one who
  cancelled — the red "Ticket not confirmed"; an unknown one — "Ticket not found"; without network
  — "No connection, try again", the code stays in the field, after the network is back a retry
  passes; focus on "Next", Enter — into the empty field. Ticket A's page, opened with the
  cancellation confirmation before the check-in: "Yes, cancel" → 409 → "You were checked in at
  HH:MM", no button and no alert, the same after a reload. The console has only network messages
  about the expected 401 (before login), 404, 409 and the network break; no JS errors.
- Research: someone else's event → 403, a nonexistent one → 404 — the decision already existed
  (2026-10-29 01:17), `get_org_event` was postponed in phase 1 until the first endpoint by id — it
  appears here. The counters — `EventQuerySet.with_registration_counts`; the race threads —
  `config/tests/concurrency.py` (`run_together`); DRF itself returns Django's `PermissionDenied`
  and `Http404` as 403 and 404.

- The base of stage 3 — `f953669` (`main` after merging the flaky test fix), the
  `feat/checkin-dashboard` branch.
- Stage 3: the review — one finding (a background refresh error hid the data; the decision —
  `decisions.md` 11:51, the fix `fd48609`, the same on the other pages — `7b3c818`), the repeated
  review — three minor ones (decisions — 12:51 and the next entry; `0df70a0`, `e7f4ac9`). A pass in
  Chromium on slot 1 (a Playwright script): the title in the list leads to the panel; an empty
  panel — counters 2/0/0/0/2 and "No registrations yet"; after three registrations for 2 seats and
  a check-in of the first code in lower case — "Admitted — Ann, an\*\*\*@example.com", the heading
  "Check-in: <title>", an "Event panel" link; the panel — 2/2/1/1/0, the table in queue order, "On
  the waitlist, #1", the check-in time; the "Waitlist" filter changes the URL and the rows,
  "Cancelled" — "No one with this status", "back" returns the previous filter, `?status=gone` —
  everyone and "All" selected; a broken event refresh — an alert above the previous data, the
  table in place, a delayed retry — "Loading…" on the disabled button, after the answer the alert
  goes away; `/org/events/999999` and its check-in — "Event not found", no form; a 500 on the event
  at check-in — "Could not load the event title, check-in works", the heading "Check-in", the form
  is there. The console has only network messages about the planned 401, 404, 500 and the break;
  no JS errors.

- Stage 4: base `05986df` (`main` after merging PR #15), the `feat/checkin-close` branch; the
  review — on the range `6ede94e..c7d03e6` before the rebase (the same base tree). The review — no
  findings; a remark outside the range about the event cache after check-in is already in "later".

## Later

- After a 401 `redirectOnExpiredSession` (`app/session-expiry.ts`) sends to `/login` without a
  return address, and login always opens `/org/events`: the organizer at the entrance looks for the
  check-in screen again after logging in again. Pass `?next=<current path>` and return there after
  login; accept only an internal path (`/…`, not `//…`), otherwise it is an open redirect. From the
  repeated review of stage 1, finding 1.
- Session lifetime: there are no session settings, the Django defaults apply —
  `SESSION_COOKIE_AGE` 2 weeks from login, `SESSION_SAVE_EVERY_REQUEST = False`, that is, the
  lifetime is not extended by activity. An organizer who logged in almost two weeks ago will lose
  the session in the middle of a check-in. There is no "token" to refresh — it is a Django session,
  not a JWT; an option is a sliding lifetime (`SESSION_SAVE_EVERY_REQUEST = True`, writing the
  session on each request) or a shorter lifetime with extension. No decision yet. A separate
  endpoint that the frontend calls once an hour is not needed: with a sliding lifetime any
  organizer request extends the session, and a ping from an open tab would keep the session alive
  forever — on an abandoned laptop too.
- "Next" on the check-in screen: disable it for 1–2 s after an answer, so that an accidental Enter
  or click does not remove the answer unread (the human's suggestion). Now a double Enter does not
  skip the answer — the second one arrives while the request is running and is cut off by
  `isPending` (checked in Chromium) — but an Enter after the answer, for example a key auto-repeat,
  will remove it.

- The check-in time "Already checked in at HH:MM" (the check-in screen) and "You were checked in at
  HH:MM" (the ticket page) — only hours and minutes. If the check-in was not today (in the
  browser's time zone), "at 09:15" reads as a time of today: a repeat of a code from a previous day
  of a multi-day event, a ticket page opened after the event. The condition is that the calendar
  day of the check-in differs from today, not "more than 24 hours have passed": a check-in
  yesterday at 23:50 seen 10 minutes later is already another day. Format: today — "09:15"; another
  day of this year — "31 Oct at 09:15"; another year — with the year. One pure function with tests
  at the day boundary; needed on three pages (since stage 3 also the "Checked in" column in the
  panel's participant table) — `shared/lib`, if the rule has no domain (it is date formatting).
  The human's suggestion, after stage 2.

- Registering for an event that has started is not forbidden (a Non-Goal of phase 1): one can
  register during the event and pass check-in right away. Closing registration at `starts_at` is a
  change of the phase 1 API, no decision yet.

- A check-in does not invalidate the event cache (`orgEventQuery`): the panel opened from the
  check-in screen first shows the counters from before the check-ins ("Arrived" is lower) and
  updates them after a request. An option — `invalidateQueries` by the event key in the check-in's
  `onSuccess`. Found in the e2e of task 4.1.
