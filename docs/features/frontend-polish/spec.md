# Frontend polish: spec

Phase — `docs/roadmap.md`, phase 6. Status: approved 2026-11-03; extended with stage 5 the same day.

## What and why

The screens of phases 1–5 were each made on their own: each page has its own `<main>` with padding
and width, there is no shared header, one cannot log out of the organizer's area (the `logout`
endpoint exists, there is no button), an unknown address gives an empty screen, each page draws "not
found" and loading errors its own way, `/health` has no styling. The phase assembles them into one
application: a shared layout with navigation, uniform states, phone width. Plus the frontend items
from "later" of phases 1–5: a return after login, the check-in time with a date, the event
description (`textarea`, collapsed display), a pause on "Next" at check-in, flaky Vitest tests.
Stage 5 is what was postponed during the phase plus paged event lists: the only place in the phase
where the backend and the API change.

## Non-Goals

- User sign-up — open question 1; splitting pages into `features` — question 2.
- A burger menu: the header has no more than three items, at 360 px they fit in a row.
- A dark theme: `styles.css` has no dark palette — a new palette and checking the screens in two
  themes.
- Transition animations; the event title in the tab title (the title comes from the route).
- Skeletons instead of "Loading…"; reworking the layout "for beauty".

## Where the code lives

- `app/ui/AppLayout.vue` — the header and `<main>` around `<RouterView>`; it has one consumer, so it
  is `app`, not `widgets`. `entities/session/api` — `logout` next to `meQuery`.
- `shared/ui/error-state` — `ErrorState` (a title, a text, an actions slot) and `NotFound` on top of
  it.
- `shared/ui/expandable-text` — a collapsed description (the event and the organizer's layout).
- `shared/ui/char-counter` — a character counter under the event title and description.
- `shared/ui/shadcn/textarea` — the description field (creation and editing).
- `shared/lib` — date formats: `short` (lists), `long` (the event, the ticket, the layout) instead of
  five copies of `startsAt`; `formatMoment(iso, now)` — the check-in time; `safeNext(path)`.
- `pages/not-found` — the `/:path(.*)*` route, last in `app/router.ts`.

## Session

- **Who is logged in is known by `meQuery`; who goes where is decided only by the guard.** The
  header requests `meQuery` on any screen and only shows the answer: a 401 of `me` for a guest is
  `null` and leads nowhere. `GET me` for a guest stays 401 (there is no "current user" resource
  without login); the 401 `me` line in a guest's console is the only acceptable console error in a
  browser check.
- **A 401 in the middle of a session:** `session-expiry` does not send to `/login` by itself — it
  sets `me` to `null` and repeats the current navigation (`router.replace` with `force: true`); the
  guard decides.
- **Return after login.** The guard sends from `requiresAuth` to `/login?next=<fullPath>`; login
  goes to `next`, otherwise `/org/events`; a logged-in user on `/login?next=…` also goes to `next`.
  `safeNext` accepts only an internal path: it starts with `/`, but not with `//` and not with `/\`;
  otherwise `/org/events` (an open redirect). After logout — `/` without `next`.
- **The previous user's data** — `forgetUserData` removes all queries that are not on the screen: on
  login (after a 401 the cache keeps the previous user's events and participants) and on logout.

## UI

**The header** on all screens: on the left "Events" → `/`; on the right by `meQuery`: a request in
flight — empty (no flicker); a guest or an error — "Organizer login"; an organizer — "My events",
"Log out", the email from the `sm` width. **`<main>`** is shared:
`mx-auto w-full max-w-4xl px-4 py-6 sm:py-8`; a page narrows itself (forms — `max-w-xl`), the
pages' own `<main>` are removed; login — without `min-h-screen`. Pages have no "back" links:
"Events" and "My events" are in the header. **The tab title** — the route's `meta.title` (a text
key in `App.vue`) + "— Регистрация на мероприятия", `watchEffect` in `App.vue`.

**Logout.** `POST /api/auth/logout/`, the button is disabled while the request is in flight. Success
or 401 — `me` to `null`, a transition to `/`, then `forgetUserData`. An error — "Could not log out,
try again" under the header (`role="alert"`), the session and the screen do not change.

**Errors and "not found".** The URL does not change (no transition to `/404`).

- `NotFound` (a "To events" link): an unknown path and `/events/abc` — "Page not found";
  `/events/:id` — "No such event"; the ticket — "Ticket not found"; the layout — "Event not found".
- `ErrorState`: a layout 403 — "No access" with a "My events" link; the first load in `QueryState`
  failed — a text and "Retry". An error of a repeated load with data — a `RetryAlert` above the
  data, as now.

**States.** A screen that reads data goes through `QueryState`; a form — a disabled button and a
submit error. The audit checks the table against the code: what is missing is done, "yes" — a link
to a test.

| Screen                    | Loading | Error with a retry | Empty             | Not found     |
| ------------------------- | ------- | ------------------ | ----------------- | ------------- |
| `/`, `/org/events`        | yes     | yes                | yes               | —             |
| `/events/:id`, the ticket | yes     | yes                | —                 | yes           |
| the event layout and tabs | yes     | yes                | participants: yes | yes (and 403) |
| `/health`                 | yes     | **no**             | —                 | —             |

**The event description.** In the creation and edit forms — a `textarea` (now an `<input>` drops
line breaks). On the event page and in the organizer's layout — `ExpandableText`:
`whitespace-pre-line`, collapsed to 4 lines (`line-clamp-4`); "Expand" / "Collapse" — only if the
text is cut (comparing `scrollHeight` and `clientHeight`, again on a change of the text and the
width). An empty description — nothing.

**The check-in time** (the check-in answer, the ticket, the participant table column) —
`formatMoment`: the same calendar day as now, in the browser's zone — "09:15"; another day of this
year — "31 Oct at 09:15"; another year — "31 Oct 2025 at 09:15".

**Check-in, "Next"** is disabled for 1 s after an answer: an accidental Enter or a key auto-repeat
does not remove the answer unread. The focus on the button — as now.

**Phone width** — 360 px: no horizontal page scrolling on any screen; the participant table scrolls
in its own block, the name and the email in it have a width limit and wrap; the header is in one
row; the layout tabs wrap (`flex-wrap`); long titles, names and emails — `wrap-anywhere`. **A
uniform look:** `h1 text-2xl font-semibold`, two date formats, list cards — `Card`.

## Stage 5

From "later" of this phase and phase 4 (decision of 2026-11-03 23:55).

- **Navigation links** — a component in `shared/ui` on top of `RouterLink`: the current section is
  highlighted (and `aria-current="page"`, as the layout tabs have now); the header and the layout
  tabs.
- **Cursor**: `pointer` on buttons, `not-allowed` on disabled ones (`disabled`, `aria-disabled`) —
  in the application styles, `shared/ui/shadcn` is not edited.
- **`/health` from the interface**: in the first-error block of `QueryState` — a link button
  "Service status" next to "Retry". Without network (`navigator.onLine`, the `online` / `offline`
  events) — one "No internet connection" bar under the header (`AppLayout`), not a line in each
  error.
- **Forms**: a "12/200" character counter under the title and the description (creation and
  editing); the limits come from `entities/event/model/event-form.ts`, shared with the schema. No
  form library is taken (decision of 2026-11-04 16:13).
- **List order**: upcoming — the nearest by `starts_at` first, past — the recent first; with equal
  `starts_at` the upcoming put the larger `id` first (created later), the past the smaller: past is
  the same order turned back (decision of 2026-11-04 16:55).
- **Paged output** of `/` and `/org/events`: by page number with the total count in the response —
  without it one cannot go to the last page. A paging component in `shared/ui`: "first",
  "previous", the numbers next to the current one with an ellipsis, "next", "last"; one page — no
  paging; the number is in the address (`?page=`).
- **The "Upcoming" / "Past" tabs** on `/` and `/org/events` (`period=upcoming|past` in the API and
  in the address, upcoming by default; changing the tab — the first page). Past means `starts_at` in
  the past: an event has no end time. Registering for a past event from its page stays possible — a
  ban and an end time go to "what's next" of the README.

Open questions of the stage (decided at the start of the tasks): 5.4 — a counter or a form library
(decided: a counter); 5.6 — the page size (decided: 20); 5.7 — what to show on a page past the end
(`?page=999`): 404 or the last one (decided: the text "No events here." and a link to the last one,
as for the participants).

## Vitest tests

Flaky: `TicketPage` "cancels, rereads…", `EventPage.test.ts:197`, under load — `LoginPage`,
`OrgEventNewPage`, `OrgCheckinPage`, `OrgEventPage` ("later" of phases 2, 4, 5). The hypothesis —
`flushPromises()` where the MSW response arrives later than a tick, and a render after jsdom is torn
down. The goal — waiting for the result (`findBy…`, `waitFor`), without raising timeouts. Done — 10
runs of `make test-frontend` in a row are green under load (in parallel with
`make stack-check-backend`). The limit is 2 hours; if it does not fit — the hypothesis and what was
tried go to "later".

## Edge cases

- Logout in one tab, another is on the panel: its next request — 401 → `me` `null` → the guard sends
  to `/login?next=…`; a repeated click on "Log out" during the request — one `POST`.
- A guest on an unknown path under `/org/...`: the path is not `requiresAuth` — 404 without a
  transition to login.
- `next` to `/login` (`/login?next=/login`) or to a nonexistent path — login leads there, the guard
  or the 404 answer as usual; there is no loop: the guard sends a logged-in user from `/login`
  onward.
- Check-in → the "Participants" tab: the counters may be from before the check-in ("later" of phase
  3); since phase 4 the layout holds the stream on all tabs — check whether it is outdated; if not —
  `invalidateQueries`.

## Assumptions and open questions

1. **User sign-up** — not in the spec; the phase closes without it, the README's "what's next" has a
   line about it. If time remains — a separate stage with an extension of the spec.
2. **Splitting pages into `features`** — not in this phase: together with polishing all screens the
   review will not separate one from the other. I suggest a separate task after the delivery.
3. Width 360 px; 320 px is not checked. The email in the header is hidden below `sm`, not cut.
4. After logout — `/`: the organizer may have logged out to look at the public part.
5. The "Next" pause — 1 s; the description is collapsed to 4 lines.

## Acceptance scenarios

| Scenario                                                                                                | Test   |
| ------------------------------------------------------------------------------------------------------- | ------ |
| A guest (`me` → 401): the header has "Organizer login", no transition to `/login`                       | Vitest |
| An organizer on a public screen: "My events", "Log out"                                                 | Vitest |
| A 401 on an organizer request → `/login?next=<path>`, after login — back to the path                    | Vitest |
| `safeNext`: `/org/events/1` — yes; `//evil.com`, `/\evil.com`, `https://…`, empty — no                  | Vitest |
| "Log out" → `/`, "Organizer login", `/org/events` leads to login                                        | e2e    |
| `logout` with an error — "Could not log out, try again", the session stays; a double click — one `POST` | Vitest |
| An unknown path and `/events/abc` — "Page not found"; `/events/999` — "No such event"                   | Vitest |
| The tab title from `meta.title`; `/health` without the backend — "Retry" sends a request                | Vitest |
| `formatMoment`: today, yesterday at 23:50 seen 10 minutes later, another day of the year, another year  | Vitest |
| A description with line breaks is saved and shown with them; a long one — "Expand"                      | Vitest |
| "Next" is disabled for 1 s after a check-in answer                                                      | Vitest |
| The current section in the header and the current layout tab are highlighted, `aria-current="page"`     | Vitest |
| A loading error — a link to `/health`; without network — a bar under the header                         | Vitest |
| Two events with one `starts_at`: the upcoming put the larger `id` first, the past the smaller           | pytest |
| A list longer than a page: going to the last and the first page, the number is in the address           | e2e    |
| `/` and `/org/events`: a past event — only on the "Past" tab, the recent first                          | e2e    |
| 360 × 740: each screen (public, login, panel, tabs, ticket, 404) — `scrollWidth` ≤ the window           | e2e    |
| Each "yes" of the "States" table — a link to a test in the audit task                                   | Vitest |
