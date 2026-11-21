# Reminders and event reschedule: tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

## Stage 1. Reschedule and limit change

- [x] 1.1. Tracer bullet: a date reschedule end to end — `Event.schedule_version`, the
      `rescheduled` email kind (migrations), `update_event` only for `starts_at`,
      `PATCH /api/org/events/{id}/`, `openapi.yaml` and types, the "Edit" tab with the date field.
      Done when: pytest — a reschedule gives an email to `confirmed` and `waitlisted` and version
      +1, the same date — neither emails nor a version; in the browser a reschedule → emails in
      Mailpit.
- [x] 1.2. `PATCH` of the other fields: title, description, limit (higher — a promotion from the
      waitlist with `promoted`, below the confirmed — 400 `below_confirmed`),
      `notify_stats_changed`; 401 / 403 / 404, a date in the past — 400 `past`. Done when: pytest
      for each case.
- [x] 1.3. The whole edit form: the form model — from `pages/org-event-new` to `entities/event`;
      all fields with the current values, sending only the changed ones, the button disabled
      without changes, a reschedule confirmation with the number of recipients, field and network
      errors, the event cache — from the response. Done when: Vitest for the form states.
- [x] 1.4. E2E: a reschedule → reschedule emails to a confirmed and a waitlisted one in Mailpit; a
      higher limit → the "A seat became free" email to the first one on the waitlist. Done when:
      both pass in `make stack-e2e` and fail without the emails.

## Stage 2. Reminders and demo data

- [x] 2.1. `enqueue_reminders(now)` and the `reminder` kind (a migration), a call from the worker
      once every 30 s. Done when: pytest — one reminder per registration and date, the 24 h rule,
      `waitlisted` / `cancelled` / a past event without emails, a new reminder after a reschedule,
      a reschedule during the pass — not about the old date (Postgres).
- [x] 2.2. `make seed` (`seed_demo`) and `make stack-seed`; README and `development.md`. Done when:
      after `make stack-seed` there are three reminders in slot 1's Mailpit ~30 s later.
- [x] 2.3. Closing the phase: the criteria by facts, `architecture.md`, README, roadmap.

## Log

- the base of stage 1 — `ae1e639`.
- research: emails — `_enqueue` in `emails/services.py` (the key by the ticket code; for a
  reschedule — its own key by `schedule_version`), the lock and the promotion — `cancel` /
  `_promote_first_waitlisted`; the form and the error codes — `pages/org-event-new/model/event-form.ts`;
  the tabs — `OrgEventLayout`.
- the review of stage 1 — `ae1e639..f8540cd`, three findings fixed (`3ac738e`, `bde84ca`,
  `b6635e3`); a repeated review was not run (the human's decision). The browser pass of stage 1 on
  slot 1 — done.
- the review of stage 2 — `e3cbb12..6775e04`, three findings fixed (`6009cd1`, `c44ab99`,
  `45a7266`); the repeated one — `6775e04..45a7266`, two gaps in the tests closed (`cf21240`).

## Later

<!-- Found outside the tasks: what, where, why not now. -->

- `frontend/src/pages/ticket/ui/TicketPage.test.ts`, "cancels, rereads the ticket and refreshes the
  events", failed once in a full `make stack-check` run (2026-11-02 10:34) with an unhandled
  `ReferenceError: window is not defined` from `vue-i18n` (`translate`): it looks like a render
  after the jsdom environment was torn down — a promise or a timer of the test lives longer than
  the test. Alone — 5 out of 5, a repeated `stack-check` passed. For the stage 1 reviewer the same
  test failed differently: `isInvalidated` is `false` (line 184) — it looks like the check runs
  before the invalidation has happened. Not now (the human's decision): the test and the page do
  not belong to phase 5.
