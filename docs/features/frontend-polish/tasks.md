# Frontend polish: tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

## Stage 1. Layout, header and session

- [x] 1.1. Tracer bullet: logout from the header end to end — `AppLayout` in `App.vue` (the header
      and a shared `<main>`, the pages' own `<main>` removed), the header by `meQuery` on any screen
      (in flight — empty, a guest — "Organizer login", an organizer — "My events", "Log out", the
      email), `logout` in `entities/session`, success — `me` `null`, the organizer cache cleared,
      `/`. Done when: Vitest — three header states, a guest without a transition to `/login`,
      logout; in the browser login → "Log out" → `/` with "Organizer login".
- [x] 1.2. Logout: an error — "Could not log out, try again", the session stays; 401 — like
      success; the button is disabled in flight. Done when: Vitest — an error, 401, a double click
      — one `POST`.
- [x] 1.3. Only the guard decides: `session-expiry` sets `me` to `null` and repeats the navigation
      (`force: true`); the guard sends to `/login?next=<fullPath>`; login and a logged-in user on
      `/login` — to `safeNext(next)`, otherwise `/org/events`. Done when: Vitest — `safeNext` by
      the spec table, a 401 on the panel → `/login?next=…` → back after login, `next=/login`
      without a loop.
- [x] 1.4. E2E `organizer-logs-out.spec.ts`: login → "Log out" → `/`, "Organizer login",
      `/org/events` leads to `/login?next=/org/events`, login returns there. Done when: passes in
      `make stack-e2e` and fails without the logout button.

## Stage 2. Errors, "not found" and states

- [x] 2.1. `shared/ui/error-state` (`ErrorState`, `NotFound`), `pages/not-found` and the
      `/:path(.*)*` route; `NotFound` on the event, the ticket and in the layout, `ErrorState` for
      the layout's 403 and the first loading error in `QueryState`. Done when: Vitest — an unknown
      path, `/events/abc`, `/events/999`, the layout's 403, the first error with "Retry".
- [x] 2.2. An audit of the "States" table: do what is missing, each "yes" gets a link to a test in
      the log; `/health` — styling and `QueryState`; the tab title from `meta.title` in
      `afterEach`. Done when: Vitest — `/health` "Retry", the tab title; links in the log for all
      rows of the table.

## Stage 3. Event description and check-in

- [x] 3.1. `shared/ui/shadcn/textarea`; the description field in creation and editing is a
      `textarea`. Done when: Vitest — a description with line breaks goes into the request with
      them (both forms).
- [x] 3.2. `shared/ui/expandable-text` on the event page and in the organizer's layout: 4 lines,
      "Expand" / "Collapse" only for a cut text, empty — nothing. Done when: Vitest — a short text
      without a button, a long one with a button, expanding; browser — 360 px and desktop.
- [x] 3.3. `formatMoment(iso, now)` in `shared/lib` (test first) at check-in, on the ticket and in
      the participant table. Done when: Vitest — today, yesterday at 23:50 seen 10 minutes later,
      another day of the year, another year; the pages show the date for yesterday's check-in.
- [x] 3.4. Check-in: "Next" is disabled for 1 s after an answer; checking the event cache after a
      check-in (the "Participants" tab before the snapshot) — outdated or `invalidateQueries`, the
      outcome in the log. Done when: Vitest for the pause (fake timers); a line in the log about the
      cache.

## Stage 4. Phone and a uniform look

- [x] 4.1. Named date formats `short` / `long` instead of five `startsAt`; a uniform look: `h1`,
      list cards. Done when: `pages/` has no `startsAt`, the page Vitest tests pass with the formats
      from `shared/lib`; the look — in the stage's browser check.
- [x] 4.2. E2E `screens-fit-phone.spec.ts`, 360 × 740: public screens, login, the organizer's list
      and layout with tabs, the ticket, 404 — `scrollWidth` ≤ the window width; fix what is found.
      Done when: passes in `make stack-e2e` and fails on a screen with a wide line (checked with a
      temporary edit).

## Stage 5. Postponed: navigation, forms, event lists

From "later" of this phase and phase 4 (decision of 2026-11-03 23:55). Spec — "Stage 5".

- [x] 5.1. Navigation links — a component in `shared/ui` on top of `RouterLink`: the current
      section is highlighted and has `aria-current="page"`; in the header and in the layout tabs
      instead of their own styles. Done when: Vitest — the highlight and `aria-current` on the
      current link, not on the others.
- [x] 5.2. The button cursor: `pointer` on hover, `not-allowed` on a disabled one (`disabled` and
      `aria-disabled`) — in the application styles, not by editing `shared/ui/shadcn` (rule 9).
      Done when: browser — the form buttons, "Next" during the pause, "Log out" in flight.
- [x] 5.3. `/health` from the interface: in the first-error block of `QueryState` — a link button
      "Service status" next to "Retry"; without network — a "No internet connection" bar under the
      header by `navigator.onLine` and the `online` / `offline` events. Done when: Vitest — the link
      in the error block, the bar appears on `offline` and goes away on `online`.
- [x] 5.4. Forms: research — a character counter under the fields with a limit ("5/100", the limits
      — `entities/event/model/event-form.ts`) or a form library instead of the hand-written parsing
      and field errors; the choice — with the human, in the decision log. Done when: the chosen
      option is done on the creation and edit forms, the form Vitest tests pass, the counter has a
      test for the limit.

      The research is done (2026-11-04), the human's choice — option 1, a character counter
      (`shared/ui/char-counter`).
      How it works now: the field rules are `zod` schemas (`entities/event/model/event-form.ts`:
      title ≤ 200, description ≤ 2000; `pages/event/model/registration-form.ts`: email ≤ 254,
      name ≤ 200); the values are `reactive`; the field errors — client and server codes, shared
      (`serverFormErrors`), the same text. Editing: only the changed fields are sent
      (`changedFields`, the text is compared without the surrounding spaces), a date reschedule
      confirmation, `NumberField` applies the value on blur (`capacityTyped`). The field markup of
      creation and editing is almost the same (two copies of the template).
      Options:
      1. **A character counter** (the agent's recommendation): under the title and the description
         "12/200", "0/2000"; the limits are constants from `event-form.ts`, shared with the schema;
         the length — without the surrounding spaces, as the schema and the server check it; over
         the limit the counter is red, the error — as now, on submit; do not set `maxlength` — it
         would silently cut a paste. A small amount of work, the form tests are not rewritten.
      2. **A counter + shared event fields**: the same, plus one markup of the fields (title,
         description, date, seats, errors, counters) for creation and editing; submitting — on the
         pages.
      3. **A form library** — `vee-validate` + `@vee-validate/zod` (shadcn-vue `Form` is built on
         it): touched / dirty, validation on blur; the cost — rewriting four forms (login,
         registration, creation, editing) and their tests; trim in dirty, `NumberField` and the
         reschedule confirmation — still by hand. A risk at the end of the phase for a small gain:
         `zod` and shared error codes already exist.

- [x] 5.5. List order: upcoming — the nearest by `starts_at` first, past — the recent first; with
      equal `starts_at` — the larger `id` higher (`upcoming`, `for_organizer` in
      `events/models.py`); test first. Done when: pytest — two events with one `starts_at` in both
      lists, the larger `id` first.
- [x] 5.6. The list API (the `api-change` skill): paged output by page number with the total count
      (`count`) for `/` and `/org/events`; both have the `period=upcoming|past` filter (past —
      `starts_at` in the past), without it — upcoming; the schema, the frontend types. Done when:
      pytest — pages, the last page, a page past the end, both `period` values and an invalid one
      in both lists; `make schema` without differences.
- [x] 5.7. A paging component in `shared/ui` (based on shadcn `pagination`): "first", "previous",
      the numbers next to the current one with an ellipsis, "next", "last"; the page in the address
      (`?page=`); on `/` and `/org/events`. Done when: Vitest — the component (the first, the last,
      the middle, one page — no paging), going through pages changes the address and the request;
      e2e — a list longer than a page in `make stack-e2e`.
- [x] 5.8. The "Upcoming" / "Past" tabs on `/` and `/org/events`: the filter in the address
      (`?period=past`), changing the tab — to the first page, an empty tab — its own text. Done
      when: Vitest — both tabs, the address, the page reset, empty; e2e — a past event only on the
      "Past" tab of both lists.

## Stage 6. Tests and closing the phase

- [x] 6.1. Flaky Vitest tests (the list — the spec, "Vitest tests"): waiting for the result instead
      of `flushPromises()`, without raising timeouts; a limit of 2 h. Done when: 10 runs of
      `make test-frontend` in a row are green in parallel with `make stack-check-backend`, or the
      hypothesis and the attempts are in "later".
- [x] 6.2. Closing the phase: the criteria by facts, `architecture.md` (screens, session, the list
      API), README ("State", "what's next" — user sign-up, splitting into `features`, an event end
      time and a ban on registering for an event that has started), roadmap.

## Log

- the base of stage 1 — `194d59b` (the commit with the spec and the tasks).
- research 1.1: a `<main>` with its own padding — on 8 pages, `App.vue` is a bare `RouterView`; the
  "Organizer login" link is in the `HomePage` header (it will move into the shared one). `logout`
  (204) is the first response without a body: `unwrap` on `data: undefined` throws `unknown` — an
  `unwrapEmpty` is needed in `shared/api`. The organizer query keys start with `["org"]`; the page
  tests mount the page with a memory router, `VueQueryPlugin` and `createAppI18n` — the example is
  `LoginPage.test.ts`.
- 1.1: the header does not refetch `me` on mount (`refetchOnMount: false`) — on an organizer page
  the guard has just asked for it. Four e2e tests required an empty console on public pages and
  failed on the guest's 401 `me` — the shared `collectConsoleErrors` in `e2e/tests/helpers.ts` lets
  only it through. Browser (slot 1, 1280 and 360 px): login → "Log out" → `/`, `/org/events` after
  logout → `/login`; the console has only the guest's 401 `me`.

- the review of stage 1 — `194d59b..850369e`, four findings fixed (`f43e0cf`, `bd340f6`,
  `8e66e85`).
- the browser pass of stage 1 (slot 1, Chromium): a guest — one `GET me`, also after the focus
  returns; `/org/events` as a guest → `/login?next=/org/events` → login → back; a broken `logout` —
  "Could not log out", the panel stays; a double click on "Log out" — one `POST`; logout in the
  second tab → check-in in the first gets a 401 → `/login?next=…/checkin` → login → check-in again.
  The console — the guest's 401 `me`, the check-in's 401 after logout (the scenario itself) and the
  `logout` break caused by the check.

- the base of stage 2 — `356ecba`.
- 2.1: the `ErrorState` heading is an `h1` where it replaces the whole page (`NotFound`, the
  layout's 403), and by `level` in `QueryState`: `1` for the event, the ticket and the layout (their
  `h1` is in the data), `2` by default (the lists have an `h1` above `QueryState`). `role="alert"`
  is kept — the tests and the previous alerts.
- the 2.2 audit (the spec's "States" table), Vitest tests in `frontend/src/pages/`:
  - `/`: loading — `home/ui/HomePage.test.ts:65`, an error with a retry — `:54`, empty — `:46`.
  - `/org/events`: loading — `org-events/ui/OrgEventsPage.test.ts:27`, error — `:85`, empty —
    `:75`.
  - `/events/:id`: loading — `event/ui/EventPage.test.ts:122` (added), error — `:131`, not found —
    `:112`; `/events/abc` — `app/router.test.ts`, "an address no route matches".
  - the ticket: loading — `ticket/ui/TicketPage.test.ts:127` (added), error — `:136`, not found —
    `:119`.
  - the layout: loading — `org-event/ui/OrgEventLayout.test.ts:119`, error — `:175`, 404 and 403 —
    `:164`; participants: loading —
    `org-event-participants/ui/OrgEventParticipantsPage.test.ts:67`, error — `:140`, empty —
    `:130`.
  - `/health`: loading — `health/ui/HealthPage.test.ts` ("shows backend and database status"), an
    error with a retry — `:50` (added with `QueryState`).

- the review of stage 2 — `356ecba..21fcffa`, four findings and a remark on the spec ("back" links)
  — fixed by the human's decisions.
- the repeated review of stage 2 — `21fcffa..3546b48`, one finding (`/health` on a 503) —
  `c2379b7`.
- the browser pass of stage 2 (slot 1, Chromium, 1280 and 360 px): `/no-such-page`, `/events/abc`,
  `/org/no-such` as a guest — "Page not found", the same address; `/events/999999` — "No such
  event", `/tickets/nope` — "Ticket not found"; the layout: someone else's event — "No access" with
  a "My events" link, `999999` — "Event not found"; the backend stopped — `/` and `/health` with
  "Retry", after a start the retry loads the data; the tab titles by page, the layout tabs have
  "Participants", "Check-in". The console — the guest's 401 `me` and the 404/403/502 caused by the
  scenario. For stage 4: the home column and `/health` (`max-w-xl`) are narrower than the header
  (`max-w-4xl`).

- the base of stage 3 — `e2e0c28`.
- browser 3.2 (slot 1, Chromium, 1280 and 360 px): an event with an 8-line description — on the
  event page and in the layout cut to 4 lines with "Expand", expanding and "Collapse"; two lines —
  without a button; a paragraph that fits into 4 lines at 1280 px gets the button when the window
  is narrowed to 360 px and loses it when widened (without a reload). `scrollWidth` equals the
  window width everywhere. The console — the guest's 401 `me` before login.
- 3.4, the cache after a check-in (slot 1, Chromium): "Participants" opened before the check-in (a
  row with "—"), a check-in on its tab — "Arrived" 1 right there; going back to "Participants" —
  "Arrived" 1 right away, the row — "—" with "There are updates" until the answer of the re-read on
  mount, after 0.8 s — the check-in time, without the bar. Not outdated, `invalidateQueries` is not
  needed (the decision in the decision log). The pause: Enter right after the answer — the answer
  stays, the button is focused with `aria-disabled`; after 1 s Enter brings the field back with
  focus.

- the review of stage 3 — `e2e0c28..e28d6d0`, one finding (a copy of `checkedInWhen`) — fixed by
  the human's decision.
- the repeated review of stage 3 — `e28d6d0..28c553b`, no findings.

- the base of stage 4 — `1a13e57`.

- 4.2: on all screens `scrollWidth` was equal to the window width even before the test
  (screenshots at 360 and 1280 px before 4.1) — nothing to fix. The test was checked with a
  temporary edit: without `wrap-anywhere` on the event page's `h1` — "the event page is wider than
  the window", 887 > 360.

- the review of stage 4 — `1a13e57..0581c5d`, four findings — fixed (`9ce8e37`, `7938452` and a
  date check in Vitest); from the human — the layout tabs scroll (`b2e2e6e`), the name and email
  columns of the participant table have a width limit (`9ce8e37`). The table in the browser (slot
  1, 1280 and 360 px, a one-word name and an 85-character address): at 1280 — wraps inside 240 px,
  the table is as wide as the block; at 360 — an ordinary address breaks only at "@", the table
  scrolls in its own block, the page is 360. The date tests were checked by replacing the format
  with a nonexistent one — 4 failures.

- the repeated review of stage 4 — `0581c5d..464a92c`, one finding (the focus ring of the scrolling
  tabs) — the tabs wrap; the whole ring is visible, checked in the browser at 360 px.

- the review of stage 5 — `c57187a..4c06933`, two findings — fixed: `pointer-events` only on
  `button:disabled` (`db0bcc5`), the "Previous" / "Next" labels in the button names (`14bd2bb`).

- the repeated review of stage 5 — `4c06933..14bd2bb`, one finding (the page bar is wider than the
  window at 640–~704 px) — the labels and "…" from `md`, e2e `page-bar-fits` at five widths
  (`c6e12cc`).

- the base of stage 6 — `011a296` (a branch from stage 5, PR #29 is not merged).
- 6.1: the tests from the spec already wait for the result — they were converted along the way in
  stages 2–5. 10 runs of `make test-frontend` in parallel with `make stack-check-backend` — 406 out
  of 406 each, both before and after the edit. A load heavier than the criterion (three
  `pnpm test` at once, 5 times) revealed one race: `TicketPage` "cancels, rereads…" — the
  "Registration cancelled" text appears from the cancellation response, and the lists are
  invalidated after the ticket is re-read; the test waits for `isMutating() === 0`. Without load
  the race is not reproduced — a failure without the edit was not checked. The rest under the
  triple load — timeouts (see "later"); the second such run brought down WSL — do not repeat.
- the review of stage 6 — `011a296..fab1f7b`, two findings in the roadmap (a link to the phase
  spec, open paragraphs in a closed phase) — fixed.

## Later

<!-- Found outside the tasks: what, where, why not now. -->

- ~~there is no link to `/health` in the interface: in the loading error block (`ErrorState` in
  `QueryState`) — a "Check the service status" link; on `/health` — an "Internet" line by
  `navigator.onLine` and the `online` / `offline` events. The human's suggestion, outside the phase
  spec.~~ — task 5.3.
- ~~the button cursor: `pointer` on hover, `not-allowed` on a disabled one, possibly on a button in
  the loading state. Through tokens or a wrapper, not by editing `shared/ui/shadcn` (rule 9).~~ —
  task 5.2.
- ~~navigation links — a component with a highlight of the current section (the header, the layout
  tabs).~~ — task 5.1.
- ~~a character counter under the input fields ("5/100" — how much more can be written; the limits
  — in `entities/event/model/event-form.ts`), or instead a ready form library to remove the
  hand-written form code (parsing, field errors, server errors). The human's suggestion.~~ — task
  5.4.
- under a load three times the 6.1 criterion (three `pnpm test` at once) only timeouts remain: 5 s
  for the first test of a file (a cold import) and 1 s of `vi.waitFor` in `AppLayout.test.ts:92`
  ("shows nothing on the right…", the response through a 50 ms timer) and
  `OrgEventLayout.test.ts:126` (waiting for the first `GET`). Not order races — the machine lacks
  CPU; per the spec we do not raise timeouts. If they start failing under normal load —
  `pool: "vmThreads"` (Vitest's advice: one jsdom per worker) or fewer workers.
