# Roadmap

The phases of work up to the delivery (2026-11-05). The phase status is in the heading:
`not started`, `in progress`, `done`. A phase is done when the criteria are met, `make check` and
CI pass, the phase's sections in `docs/architecture.md` are brought in line with the code, and the
rows of the "requirement → test" table in the README for its requirements point to real tests.

Each phase from the third on has its own `docs/features/<slug>/spec.md` and `tasks.md`, here there
is only a link (decision of 2026-10-31 06:19); the tasks of phase 0 are listed right here. A task is
checked `[x]` in the same commit that does it (the hash cannot be written into that same commit —
it depends on the contents); which commit closed what — `git log -- docs/roadmap.md`.

How to maintain this file — the `session-handoff` skill (`.claude/skills/session-handoff/`).

The phases are vertical: each includes the backend, its own screens and the e2e of its scenarios,
so a closed phase is checked in the browser, and the rows of the "requirement → test" table in the
README are filled in along the way (decision of 2026-10-29 00:36).

## Phase 0. Skeleton — done

Criteria: `make check` and the e2e smoke pass locally and in CI; the hooks work; the project starts
from scratch by `docs/development.md`.

- [x] Tools in the root: Prettier, husky, lint-staged, commitlint
- [x] Agent rules in `AGENTS.md`, the repository map
- [x] The roadmap, the `session-handoff` skill, the `SessionStart` hook
- [x] Claude Code hooks: protection against bypassing git hooks, formatting after an edit
- [x] Backend: Django, a custom user model, ruff, mypy, pytest; Postgres in compose; Makefile
- [x] Backend: health endpoint, the OpenAPI schema and a check that it is up to date
- [x] The `pre-push` hook: checks of the affected part
- [x] Backend and migration rules, a hook protecting committed migrations
- [x] Frontend: Vue, the health page, ESLint, vue-tsc, Vitest, the FSD skeleton
- [x] The whole stack in docker compose (postgres, backend, frontend), `make up`; a README with
      running instructions
- [x] e2e smoke on Playwright
- [x] CI in GitHub Actions; the first green run on GitHub — 2026-10-28
- [x] Agent rules for the frontend and e2e; the `anti-slop-review`, `feature-workflow`,
      `fsd-frontend` skills, the `reviewer` agent (`api-change` — with the first domain
      endpoint, phase 1)

## Phase 1. Registration, waitlist, cancellation — done

Spec and tasks — `docs/features/registration/`. The design — the "Authentication", "Data model",
"Invariants and concurrency", "API" sections in `docs/architecture.md`.

Criteria: the organizer logs in and creates an event; registering again does not create a second
seat; when seats run out — the waitlist; a cancellation promotes the first one from the waitlist; a
race test for the last seat on Postgres.

Screens: organizer login, event creation, the event list, the event page with a registration form
and the result ("you have a seat" / "you are on the waitlist, #N"). Cancellation in this phase is
the API and tests; the ticket screen with a cancel button comes in phase 2, when the link to it
arrives by email. E2E: the organizer creates an event, a participant registers.

Along with the phase come (decisions in `docs/decisions.md`):

- the `api-change` skill — the API change procedure, on the example of the first domain endpoint;
- `docs/rules/concurrency.md` — how to write code with locks and race tests;
- in the README — the "requirement → test" table with the rows of the phase's requirements;
- demo accounts — a management command at `backend` start in compose: the organizer
  `demo@example.com` / `demo` (the reviewer and e2e log in with it) and a separate administrator
  `admin@example.com` / `admin` for the admin (`architecture.md`, "Environment");
- Event and Registration in the admin; Registration is read-only (`backend/AGENTS.md`, rule 9);
- CSRF on the frontend: `shared/api` passes `X-CSRFToken` from the `csrftoken` cookie in modifying
  requests — otherwise the first `POST` after login gets a 403.

A participant's email is normalized only by case: dots and `+tag` are significant, there is no
provider-specific canonicalization (Gmail) — decision of 2026-10-28 22:38 in `docs/decisions.md`.
Test: addresses that differ only in case — one registration; with a dot — different ones. The
README has the caveat "one email — one seat; different addresses of one mailbox (dots and `+tag` in
Gmail) count as different".

## Phase 2. Outbox, worker, emails — done

Spec and tasks — `docs/features/emails/`. Criteria: the `ticket`, `waitlisted`, `promoted` emails
are created in the transaction of the change and delivered by the worker to Mailpit; retries on an
SMTP error. Mailpit and the `worker` service are added to compose in this phase.

The emails are created by `register` and `cancel` in `backend/registrations/services.py` — in the
same transaction and under the same Event lock; the sending itself is done only by the worker, the
rule is `docs/rules/concurrency.md`, item 5 of the "Code" section.

Screens: the ticket page from the email link — the code, the status, the place on the waitlist,
cancellation. E2E: registration → an email in Mailpit → the ticket via the link → cancellation →
the first one on the waitlist gets the seat and an email.

## Phase 3. Check-in and organizer statistics — done

Criteria: a ticket passes check-in once, including under simultaneous requests; counters of the
registered, the waitlisted and the arrived.

Screens: the organizer's event panel (counters, participants), the check-in screen (code input, a
large answer "admitted / already checked in at HH:MM / not found"). E2E: a repeated check-in of the
same ticket is rejected.

Spec and tasks — `docs/features/checkin/`.

## Phase 4. Realtime (SSE) — done

Spec and tasks — `docs/features/realtime/`. Criteria: the counters in a second tab update without
a reload; reconnection with a snapshot; a disconnection indicator.

Screens: live counters on the organizer's panel and free seats on the event page; a
"reconnecting" indicator. E2E with two contexts: a check-in in one — the arrived counter changes in
the other without a reload.

Environment: an nginx gateway in compose (`architecture.md`, "Processes") — e2e goes through it, so
SSE is checked behind a buffering proxy, as in production; `make up` stays on Vite (the human's
decision, the phase spec, "Assumptions", item 4).

## Phase 5. Reminders and event reschedule — done

Spec and tasks — `docs/features/reschedule/`. Criteria: exactly one reminder per event date; a
reschedule email to `confirmed` and `waitlisted`; the rule "a seat obtained within 24 hours — no
reminder".

Screens: event editing by the organizer (date reschedule, limit change). `make seed` with demo
events and participants (the demo organizer appeared in phase 1). E2E: an event reschedule →
emails to participants in Mailpit.

## Phase 6. Frontend polish — done

Spec and tasks — `docs/features/frontend-polish/`.
Screens appear in phases 1–5; here is what is visible only in the assembled application.
Criteria: shared navigation and layout; all screens have loading, error and empty-list states;
work at phone width; a uniform look.

User registration (decision of 2026-10-30 00:48) and splitting pages into `features` (decision of
2026-10-31 14:46) are not done — they are in "What's next" (decision of 2026-11-04 18:47; moved from the README to the end of
this file on 2026-11-20).

Stage 5 — what was postponed to "later" during the phase, paged event lists with a shared order
and the "Past" tab in both lists (backend and frontend; decisions of 2026-11-03 23:55 and
2026-11-04 00:00).

## Phase 7. Delivery — done

Spec and tasks — `docs/features/delivery/`. Criteria: each requirement of the assignment is covered
by a test, e2e with two contexts — for the requirements about two clients; README: the "requirement
→ test" table checked against the tests, the state, the model and the tool, "what's next", "what
was borrowed"; a check for junk (`anti-slop-review`); the session export to `docs/session/`.

In "what's next" of the README — a push server (Centrifugo) instead of streams in the Django
process: when there are thousands of connections or more than one backend process (decision of
2026-10-31 21:04).

## Phase 8. English interface and emails — in progress

Spec and tasks — `docs/features/english-ui/`. Criteria: every screen, the emails and the demo data
are English by default; every component keeps its Russian texts with the same keys (a test);
`make check` and `make e2e` pass.

## What's next

The requirements of the assignment are met; below is what was postponed along the way (the
Non-Goals of the specs and "Later" in `docs/features/*/`) and what is needed for the test
assignment to become a product.

### Next round

- An event end time and a ban on registering for an event that has started: now one can register
  for an event that has started, and it is visible on the "Past" tab.
- Organizer sign-up (a screen and an endpoint): now the accounts are created by a command and in
  the admin.
- A sliding organizer session lifetime: now it is two weeks from login, and the session may end in
  the middle of a check-in.
- A flaky Vitest (`window is not defined` from `vue-i18n` after jsdom is closed) — find which
  promise or timer of a test outlives the test.
- A language switch and Russian emails: the English interface is the default since phase 8, the
  Russian texts are kept but nothing shows them. Done properly: the language in the address
  (`/en/…`, `/ru/…`, links in emails lead to the email's language), the first choice by
  `Accept-Language`, a switch in the header with the language names, `Registration.locale` so that
  each participant gets the emails in the language they registered in (decision of 2026-11-21
  01:19).
- Splitting pages into `features` (FSD): now the screen code is on the page while it has one
  consumer.

### To become a product

- **Deployment.** The build behind the gateway already exists (`gateway`, e2e uses it); what is
  needed is `DJANGO_DEBUG=false` with a real key and `ALLOWED_HOSTS`, TLS, cache headers for static
  files, migrations on rollout, Postgres backups, monitoring and error collection.
- **Scaling live updates.** A push server (for example, Centrifugo) instead of SSE streams in the
  Django process — when there are thousands of connections or more than one backend process: the
  backend publishes a snapshot of the counters, the push server holds the browser connections.
- **Email.** A real SMTP provider instead of Mailpit, HTML emails, a QR code in the ticket,
  unsubscribe and complaints; resending `failed` emails from the admin; cleaning sent emails out of
  the outbox; waking the worker through `LISTEN/NOTIFY` instead of polling once a second.
- **Abuse.** Rate limiting of login and registration, a captcha. A participant's address is not
  verified: one can register someone else's email, and the emails will go to them.
- **Organizers.** Roles and organizer teams (now an event belongs to one account).
- **Events.** Cancelling and deleting an event with emails to the participants; an event time zone
  (now the dates in emails are UTC); a custom lead time and several reminders, a reminder to the
  waitlisted; an email about a change of the title or description.
- **Check-in and participants.** A QR scanner instead of typing the code, undoing a mistaken
  check-in, check-in by name, a check-in window by the event time; the seats of no-shows go to the
  waitlist; search over participants and a list export.
- **Interface.** A live ticket page: now it is re-read when the tab is returned to, and the place
  on the waitlist or an obtained seat does not change before your eyes. A dark theme, skeletons
  instead of "Loading…".
