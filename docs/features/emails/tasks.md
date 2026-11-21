# Outbox, worker, emails: tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

The phase is split into vertical stages: each ends with something that can be shown in the browser
or in Mailpit. Inside a stage — sub-stages by layer: backend → frontend → e2e/docs. Logic — test
first; `make check` in each sub-stage.

## Stage 1. A ticket email in Mailpit (tracer bullet)

The end-to-end path: `register` → outbox in the transaction → worker → SMTP → an email in Mailpit.

- [x] 1.1 backend: the `emails` app, the OutboxEmail model + migration, admin (read-only);
      `enqueue_email` (a text snapshot, `ON CONFLICT DO NOTHING`), the `ticket` template;
      `register` queues `ticket` in the same transaction; the `EMAIL_*`, `DEFAULT_FROM_EMAIL`,
      `FRONTEND_URL` settings. Done when: the tests "one email with the code and a link", "a
      repeat — no email", "a rollback — no email", "the same key — one row" are green.
- [x] 1.2 backend + infrastructure: `process_batch()` (`SKIP LOCKED`, `sent`) and the
      `run_worker` command; the `mailpit` and `worker` services in compose, `FRONTEND_URL` from
      `FRONTEND_PORT`; `development.md` (Mailpit, worker, ports). Done when: the test "`pending` →
      `sent`, an email in `mail.outbox`" is green; after `make up` a registration in the browser
      gives an email in Mailpit on :8025.

## Stage 2. The ticket page from the email link

- [x] 2.1 backend: `GET /api/tickets/{manage_token}/` along the api-change path
      (service/serializer, `openapi.yaml`, frontend types). Done when: the response tests for
      `confirmed` / `waitlisted` / `cancelled` and 404 are green, the schema is up to date.
- [x] 2.2 frontend: the `ticket` entity, the `/tickets/:token` page — the code, #N, "cancelled",
      "not found", loading; cancellation with a confirmation. Done when: Vitest (MSW) for the states
      and cancellation is green; in the browser the link from the email opens the ticket,
      cancellation works.
- [x] 2.3 e2e: registration → a `ticket` email in Mailpit (API) → the link → the code on the page
      matches the email → cancellation → "cancelled". Done when: the scenario passes on
      `make up`, there are no errors in the console.

## Stage 3. Waitlist and promotion

- [x] 3.1 backend: `register` queues `waitlisted` (the position at the time of the email), `cancel`
      — `promoted` to the promoted one; a revival after a cancellation — a new email. Done when:
      the tests "waitlist → `waitlisted` with #N", "a cancellation → `promoted` to the first one",
      "a cancellation from the waitlist / a repeated cancellation / an empty waitlist — no
      emails", "a revival — a new email" are green.
- [x] 3.2 e2e: an event with 1 seat; the second participant gets `waitlisted`; the first cancels
      via the link → the second gets `promoted`, their ticket via the link is `confirmed` with a
      code. Done when: the scenario passes.

## Stage 4. Retries and several workers

- [x] 4.1 backend: an SMTP error → `attempts`, `last_error`, `next_attempt_at` with a growing
      pause; after 5 attempts — `failed`; an error of one email does not stop the batch, and the
      emails of the batch sent before it stay `sent`; the log gets the email `id` and the error
      class, without the text (it may contain an address); a database error in the `run_worker`
      loop — a log entry and a pause, not the end of the process. Done when: the tests with a
      failing email backend are green; in the browser: `docker compose stop mailpit` → a
      registration → `attempts > 0` in the admin → `docker compose start mailpit` → the email
      arrived.
- [x] 4.2 backend: a race test of two workers (`threading.Barrier`, Postgres) — each email is sent
      once; the rule in `docs/rules/concurrency.md`. Done when: the test fails without
      `select_for_update`, 20 runs in a row are green.

## Stage 5. Closing the phase

- [x] 5.1 docs: README — the "requirement → test" rows for emails, the caveat "delivery is at
      least once", Mailpit in the running instructions; `architecture.md` — the phase's sections →
      "implemented" by the code. Done when: each row of the table points to an existing test.
- [x] 5.2 review by the `reviewer` agent, a pass in the browser (negative: an unknown token, a
      cancellation without network, a double click on "Cancel", two ticket tabs), closing the phase
      by `session-handoff`. Done when: the confirmed remarks are fixed, the phase status is `done`.

## Log

<!-- 2–3 lines of research findings; where the work stopped if the session was interrupted. -->

- The base of stage 5 — `057a44c`.

## Later

- Cleaning up sent emails older than N days (step 3 of the worker loop in `architecture.md`) — a
  Non-Goal of phase 2: the outbox volume in the demo is small.
- Vitest `TicketPage.test.ts` › "cancels, rereads the ticket and refreshes the events" failed once
  for the stage 3 reviewer (`No button "Да, отказаться"`) and passed on a rerun; 12 consecutive
  runs are green, the failure was not reproduced. A hypothesis, not checked: an extra re-read of
  the ticket before the click (MSW returns `cancelled` on the second GET) removes the confirmation
  block.
- Vitest `frontend/src/pages/event/ui/EventPage.test.ts:197` (`[role="status"]` not found) failed
  once for the stage 4 reviewer in `make stack-check` and passed on a rerun; stage 4 did not touch
  this file. A different test, not `TicketPage.test.ts` above. The cause was not investigated.
