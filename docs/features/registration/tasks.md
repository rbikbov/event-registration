# Registration, waitlist, cancellation: tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

The phase is split into vertical stages: each ends with something that can be shown in the browser
(except stage 5: the cancellation screen — the ticket page from the email link — appears in phase 2,
because before emails the user has nowhere to get the `manage_token` from). Inside a stage —
sub-stages by layer: backend → frontend → e2e/docs. Logic — test first; `make check` in each
sub-stage.

## Stage 1. Organizer login (tracer bullet)

An end-to-end contract: view → `openapi.yaml` → types → page. Goes through the whole api-change
path.

- [x] 1.1 backend: `POST /api/auth/login/`, `logout/`, `GET me/` (session, CSRF), a management
      command for the demo accounts, called at `backend` start in compose. Done when: the
      login/logout/`me` tests are green, `openapi.yaml` is updated, `docker compose up` creates
      `demo@` and `admin@`.
- [x] 1.2 decision: the UI library and design tokens (before any frontend code). Done when: the
      choice and the rejected options are written to `docs/decisions.md`, the setup is described in
      `docs/development.md` and `frontend/AGENTS.md`, the library is installed.
- [x] 1.3 frontend: `shared/api` passes `X-CSRFToken` in modifying requests; type generation; the
      `/login` page, the route guard. Done when: the Vitest tests for CSRF and the form are green;
      in the browser `demo@example.com` logs in and lands on the `/org/events` stub.
- [x] 1.4 the `api-change` skill (including the note about 404/403 — decided: 403 on someone
      else's): remove "DRAFT", fix the "CHECK" spots based on the stage's facts. Done when: the
      skill has no draft notes.

## Stage 2. The organizer creates an event and sees the list

- [x] 2.1 backend (including deciding the field error format — a draft in the `api-change` skill,
      the "Errors" section): the `events` app, the Event model + migration, admin,
      `for_organizer`; `GET/POST /api/org/events/`. The `confirmed` / `waitlisted` counters
      through `annotate` — in 3.1, together with the Registration model (decision in
      `docs/decisions.md`). Done when: the tests for creation, validation, "someone else's is not
      visible", `django_assert_num_queries` are green.
- [x] 2.2 frontend: the `event` entity, the `/org/events` and `/org/events/new` pages, the
      empty/error/loading states; the list shows `capacity` without `confirmed` / `waitlisted` for
      now (the counters come in 3.1), field codes → `AppError.fields` and the texts in the form's
      `<i18n>`. Done when: Vitest is green; in the browser creation → a row in the list.
- [x] 2.3 e2e: the organizer logs in and creates an event. Done when: the scenario passes on the
      `make up` stack.

## Stage 3. A participant registers for a free seat

- [x] 3.1 backend: the Registration model + migration, admin (read-only); the `confirmed` /
      `waitlisted` counters in `GET /api/org/events/` through `annotate` (+ a query count test);
      `registrations.services.register` (Event lock, `confirmed`, email normalization,
      idempotency); `GET /api/events/`, `GET /api/events/{id}/`, `POST …/registrations/`. Done
      when: the service tests (including case/dot/`+tag`, a repeat) and the API tests are green.
- [x] 3.2 frontend: the public list `/`, the `/events/:id` page with the form and the "seat
      confirmed" result. Done when: Vitest (MSW) is green; registration works in the browser.
- [x] 3.3 e2e: a participant registers for an event created by the organizer. Done when: the
      scenario passes, there are no errors in the console.

## Stage 4. Waitlist

- [x] 4.1 backend: the `waitlisted` branch in `register`, `queued_at`, computing `position`; a
      repeated registration returns the previous position. Done when: the tests "no seats → the
      waitlist", the order 1,2,3, a repeat — the same position.
- [x] 4.2 frontend: the "you are on the waitlist, #N" result, `free_seats = 0` on the page. Done
      when: Vitest is green; in the browser a full event gives #N.
- [x] 4.3 e2e: extend the participant scenario — the second registration goes onto the waitlist.
      Done when: the scenario passes.

## Stage 5. Cancellation and promotion from the waitlist (API only)

- [x] 5.1 backend: `services.cancel` (Event lock, cancellation, promotion of the first by
      `queued_at, id`), `POST /api/tickets/{manage_token}/cancel/`; reviving the row on a repeated
      registration. Done when: the tests of a cancellation from `confirmed`/`waitlisted`, a
      repeated cancellation, a registration again after a cancellation are green.

## Stage 6. Concurrency and closing the phase

- [x] 6.1 backend: race tests on Postgres (`threading.Barrier`): the last seat; one email; a
      cancellation in parallel with a registration; `docs/rules/concurrency.md`. Done when: the
      tests are stably green over 20 runs in a row, the rule is written.
- [x] 6.2 docs: the "requirement → test" table and the email caveat in the README; the phase's
      sections in `architecture.md` → "implemented"; `development.md` if commands appeared. Done
      when: each row of the table points to an existing test.
- [x] 6.3 review by the `reviewer` agent, a pass in the browser (negative scenarios: empty fields,
      network, a double submit, two tabs), closing the phase by `session-handoff`. Done when: the
      confirmed remarks are fixed, the phase status is `done`.

## Log

<!-- 2–3 lines of research findings; where the work stopped if the session was interrupted. -->

## Later

- ~~The Event lock in `register` (3.1) is not covered by tests~~ — closed in 6.1:
  `registrations/tests/test_concurrency.py`, 4 tests fail without the lock.
- Organizer logout: `POST /api/auth/logout/` exists, there is no button in the interface (a
  Non-Goal of phase 1). A button is needed in the header of the organizer pages, clearing
  `meQuery`.
- Site navigation: the login page has no link to the home page, the organizer pages have no shared
  header with links (events, creation, home, logout). To be done together with the logout button.
