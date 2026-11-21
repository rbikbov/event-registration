# Realtime (SSE): tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

The stages are vertical: each ends with something that can be shown in the browser. Inside a stage
— backend → frontend → e2e/docs. Logic — test first; `make stack-check` in each task.

## Stage 1. A live "Arrived" counter on the panel (tracer bullet)

- [x] 1.1 backend: `pg_notify` in `check_in` (the first check-in), a listener per process,
      `GET /api/org/events/{id}/stream/` (a DRF view, along the api-change path) — a snapshot on
      connection and on a notification; 403/404. Done when: the tests "a notification after the
      commit, none after a rollback", "the first message is a snapshot", "a check-in → a new
      snapshot", "a repeated check-in without a notification", 403/404 are green.
- [x] 1.2 frontend: a stream composable in `shared/lib`, the panel writes the snapshot into the
      `orgEventQuery(id)` cache. Done when: Vitest with a stubbed `EventSource` is green; in the
      browser (Vite) a check-in in one tab changes "Arrived" in another.

## Stage 2. The nginx gateway

- [x] 2.1 infra: the `gateway` stage in `frontend/Dockerfile` — `vite build` and nginx on 5173, a
      proxy for `/api`, `/admin`, `/static`, a fallback to `index.html`; `FRONTEND_TARGET` in
      compose, `make e2e`, `stack-e2e` and CI — through `gateway`; uvicorn with
      `--timeout-graceful-shutdown` — in Docker and in `make dev-backend` (otherwise `--reload`
      waits for open streams forever); `development.md`. Done when: `make stack-e2e` is green
      through the gateway; `curl -N` of the stream through the gateway gets a snapshot right away,
      and without `X-Accel-Buffering: no` it does not (checked and written to the log). Measured:
      without the header the snapshots also go right away, only buffering with gzip delays them —
      the spec, item 3.
- [x] 2.2 e2e: two organizer contexts — a check-in in one, "Arrived" changes in the other without
      a reload. Done when: the test is green and fails if the stream is not connected.

## Stage 3. All counter changes, the event page, the participant table

- [x] 3.1 backend: a snapshot is read once per event and notification for all subscribers of the
      process; the views stay synchronous (the spec, "Assumptions", item 1). Done when: the stream
      tests are green; with N subscribers one notification gives one snapshot query and one
      database connection.
- [x] 3.2 backend: `pg_notify` in `register` and `cancel` (with a promotion);
      `GET /api/events/{id}/stream/` — a snapshot of the public event. Done when: the tests "one
      notification" for a registration, a revival, a cancellation with a promotion and "no
      notification" for repeats are green.
- [x] 3.3 backend: `?page=` (50 each) for `GET /api/org/events/{id}/registrations/`, the
      `cancelled` counter for the organizer's event (in `GET` and the snapshot). Done when: the
      tests of pages, of the waitlist position on the second page, `page` < 1 → 400, the number of
      queries does not depend on the number of rows — green.
- [x] 3.4 frontend: the organizer's event layout — the `/org/events/:id` route with the children
      "participants" (`""`) and "check-in" (`checkin`): the layout has one `GET` of the event, the
      stream, the header (title, counters; in one line for check-in), 403/404 and tabs; the event
      goes to a child as a prop through `RouterView`. The check-in form works without the event
      too (the exception of item 4 of `frontend/AGENTS.md`); cancelling the check-in screen's
      `GET` in the snapshot handler is no longer needed. Done when: Vitest of the layout and both
      children is green; `organizer-checks-in.spec.ts` passes; switching "check-in ↔
      participants" does not reopen the stream.
- [x] 3.5 frontend: the event page — one `GET`, then snapshots from the stream; the panel's table
      is paged, the number of pages comes from the snapshot's counters, a snapshot with other
      counters shows "There are updates — refresh". Done when: Vitest is green.
- [x] 3.6 e2e: a registration in one context changes "free seats" on the event page in another and
      shows "There are updates" on the panel; a check-in in one context changes "Arrived" on the
      check-in screen in another. Done when: the test is green.

## Stage 4. Break and reconnection

- [x] 4.1 backend: `: ping` every 15 s, `retry: 3000`, a break of the listener closes the streams
      of the process. Done when: the heartbeat and listener-break tests are green.
- [x] 4.2 frontend: the "Connection lost, reconnecting…" indicator on the panel; reopening a closed
      stream after 3 s if it was ever open; `useLive` unsubscribes on `pagehide` with `persisted`
      and subscribes again on `pageshow` with `persisted` (a page from bfcache: the stream is
      closed, and the panel does not make a `GET`). Done when: Vitest "a break → the indicator → a
      snapshot → no indicator", "502 → reopening" and "pageshow from bfcache → a new subscription"
      is green; in the browser through the gateway — "Back" after a full load of another event
      shows live counters.
- [x] 4.3 e2e: the stream is broken through `page.route` — the indicator is visible; restored — the
      indicator is gone, the counter is correct. Done when: the test is green.
- [x] 4.4 infra: `create_demo_users` — not from the backend `CMD` but `make demo-users` (by hand;
      `make e2e` and `stack-e2e` — by themselves); the password changes only if it does not match.
      Done when: the test "a repeated call does not change the hash" is green; `docker restart` of
      the backend does not log out the demo organizer; the README and `development.md` describe the
      step.
- [x] 4.5 frontend: a stream closed by a non-200 response (also on the first connection) — the page
      re-reads the event as a probe (`orgEventProbe` / `publicEventProbe`, does not write into the
      event cache): 401 → `/login` (`app/session-expiry`), 403/404 → the answer on the page, the
      stream is closed; otherwise — a retry after 3 s. Done when: Vitest "a refusal, probe 401 →
      `/login`", "a refusal, probe 200 → we stay, reopening", "probe 403/404 → the answer, no
      retry" is green.
- [x] 4.6 closing the phase: the criteria by facts, `architecture.md` ("Processes", "API",
      "Realtime", screens) — "implemented", the README. Done when: `make stack-check` and
      `make stack-e2e` are green.

## Log

- The base of stage 1 — `6cf95c4` (the phase's spec and tasks on `main` after merging PR #16), the
  `feat/realtime-org-stream` branch.
- Research of stage 1: the snapshot — `Event.objects.with_registration_counts()` and the fields of
  `OrgEventSerializer`; permissions — `get_org_event`; check-in — a conditional `UPDATE` in
  `registrations.services.check_in` (the notification — by the number of checked-in rows). Django
  5.2 under ASGI reads an async stream through `aclosing` and cancels it on `http.disconnect`.
- Stage 1: three rounds of review by the `reviewer` agent (`6cf95c4..eac8bab`, `eac8bab..c6fcb87`,
  `c6fcb87..79abd53`), the findings were gone through by the human, the decisions —
  `docs/decisions.md`, 14:46–17:33. Task 1.2 was done wider than planned: the `LiveSource`
  contract, the snapshot is the whole event, the panel without a background `GET`. Browser (slot
  1, Vite, two contexts): a check-in in one changes "Arrived" in the other without a reload. Next
  — the PR of stage 1, then stage 2.
- The base of stage 2 — `9502cca` (`main` after merging PR #17 and the bfcache plan), the
  `feat/realtime-gateway` branch.
- Stage 2: review by the `reviewer` agent (`9502cca..2cda4fe`) — three findings, all accepted by
  the human and fixed in `bcec1a4` (an entry in `docs/decisions.md`). Browser (slot 1, gateway, two
  organizer contexts): a check-in in one changes "Arrived" in the other in ~150 ms without a
  reload; the console has only the 401 of `me` on the login page before login. The "Checked in"
  column in the table stays "—" until a reload — the table is redone in stage 3.
- The base of stage 3 — `ed4f573` (`main` and the decision about synchronous streams), the
  `feat/realtime-event-page` branch.
- Research of stage 3: now each stream reads the snapshot in its own `sync_to_async` — N
  subscribers give N queries and N connections per notification; the delivery is
  `StatsListener._deliver`, and the shared read goes there. The snapshot depends only on the event
  and the serializer, not on the request.
- Stage 3, backend (3.1–3.3): review by the `reviewer` agent (`ed4f573..f0281ac`) — three findings,
  fixed in `4d8e70d`, `5cecd16`; a repeated one (`f0281ac..5cecd16`) — two, fixed in the next
  commit; the decisions — `docs/decisions.md`, 22:02 and 22:25.
- Stage 3, frontend and e2e (3.4–3.6): review by the `reviewer` agent (`aa6e6ef..abe1493`) — three
  findings, all accepted by the human and fixed in `e4f51e1`; a repeated review is not needed (the
  human's decision). Browser (slot 1, gateway): 55 registrations — two pages of the table; a
  registration in another context changes "free" for a visitor in ~50 ms and shows "There are
  updates" on the panel. Next — the PR of stage 3, then stage 4.
- The base of stage 4 — `fab854d` (`main` after merging PR #19), the `feat/realtime-reconnect`
  branch.
- Research of stage 4: on a break of the listener's connection `StatsListener._deliver` failed with
  `psycopg.OperationalError` in its task, and the streams hung without notifications and without
  `_connection = None` — the next subscriber would not have opened a new one. The ping is a
  timeout of waiting for the queue in `snapshot_stream`; `next_message` in the tests parses the
  `retry` field too.
- Browser for task 4.2 (slot 1, gateway, a Playwright script): `docker restart` of the backend — a
  break, the indicator, `EventSource` reconnects by itself, the indicator is gone after ~6 s;
  `docker stop` for 8 s — a 502 from the gateway, reopening after 3 s, the indicator is gone, a
  check-in afterwards — "Arrived" 1. bfcache: Playwright's headless shell does not enable it
  (`BackForwardCacheDisabledForDelegate`), full Chromium (`channel: "chromium"` without
  `--disable-back-forward-cache`) does; wait for `goBack` with `waitUntil: "commit"` — there is no
  `load` on a restore.
- Browser for task 4.5 (slot 1, gateway): logout through the API in the panel's context, then
  `docker restart` of the backend — a reconnection 401, `GET me` 401, `/login` ~6 s after the
  logout.
- Stage 4: review by the `reviewer` agent (`fab854d..b1793e7`) — five findings; 2–5 accepted by the
  human and fixed; 1 — the human's decision "a status probe", fixed in the next commit.
- A repeated review (`b1793e7..83b8581`) — two findings, both accepted by the human and fixed in
  the next commit.

## Later

- The settings for `runserver` (`whitenoise.runserver_nostatic`, the `django.server` logger in
  `LOGGING`) remained after `make dev-backend` moved to uvicorn: remove them or keep them for a
  manual `manage.py runserver`.
- Vitest under load (a parallel run, load average ~8) once brought down tests of pages the stage
  did not touch: `LoginPage` (the hint with `@`), `OrgEventNewPage` (creation and the return to the
  list), `OrgCheckinPage` (an empty field after a check-in), `TicketPage` (a loading error with a
  retry), later `OrgEventNewPage` (field errors without a request); the next run is green. Looks
  like waiting for one `flushPromises()` where a request through MSW takes longer than a tick.
- The browser check of stage 1 (a Playwright script, two contexts, slot 1) once failed on a 30 s
  timeout waiting for the panel's counter right after `stack-e2e`; it did not repeat in 10 runs in
  a row, the first load of the panel after a frontend restart is ~4 s. The cause is unknown; on a
  repeat — take a Playwright trace at the moment of the failure.
- Vitest under load — once more in stage 2 (load average ~6, next to it uvicorn `--reload` of slot
  0 at 90 % CPU): `EventPage`, `OrgEventPage` (a retry after a loading error), `OrgEventNewPage`,
  `TicketPage`; the next two runs of `make test-frontend` are green.
- And in stage 3 (task 3.2, the frontend did not change, load average ~5): `TicketPage` "cancels,
  rereads the ticket and refreshes the events" — the event list is not marked stale by the time of
  the check, right after `waitFor` of the text; the next two runs are green.
- Process (the human's idea, 2026-10-31): after the backend tests the contract is written first —
  the serializer, a view stub with `extend_schema` and the URL, `make schema` — and the stage's
  frontend goes in parallel in its own worktree by `schema.d.ts`. Open questions before changing
  `feature-workflow`: a slot for the second agent; conflicts in `decisions.md`, `tasks.md` and
  `schema.d.ts` on merging; accounting the time of two sessions at once; typed MSW fixtures,
  otherwise the contract does not hold the frontend tests; what to do if the contract changes after
  the split; the place of the tracer bullet and the review.
- The event description in the creation form (`OrgEventNewPage`) is a single-line `<input>`: the
  browser drops line breaks on input, although the event page renders the description with
  `whitespace-pre-line`. A `textarea` is needed (found while checking a long description, task
  3.4).
- Decide whether to show the event description to the organizer in the event layout
  (`pages/org-event`, now only the title and the date). If yes — compactly: the first 3–4 lines by
  default, and if the text is longer — an "Expand" button for the full description (the human's
  idea, 2026-11-02).
- ~~The event lists (the organizer's `/org/events` and the public `/`): paged output and one order
  everywhere — nearest by `starts_at` first, with equal `starts_at` the event with the larger `id`
  is higher (it was created later). Now both lists are whole, and with equal time the smaller `id`
  is higher: `for_organizer` and `upcoming` in `events/models.py` — `order_by("starts_at", "id")`
  (the human's decision, 2026-11-02).~~ — phase 6, tasks 5.5–5.7.
