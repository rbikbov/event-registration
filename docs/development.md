# Developer guide

Everything you need to start working on the repository: what to install, how to run it, what
commands exist, what is checked automatically and why. The document is updated together with the
code: a new command, tool, check or gotcha appears here in the same commit.

To just look at the project, without developing it, see the [README](../README.md).

## Contents

1. [What to install](#what-to-install)
2. [First-time setup](#first-time-setup)
3. [Running](#running)
4. [Commands](#commands)
5. [Working on a task](#working-on-a-task)
6. [Common tasks](#common-tasks)
7. [Automatic checks](#automatic-checks)
8. [Commits, decisions, progress](#commits-decisions-progress)
9. [Backend](#backend) · [Frontend](#frontend) · [E2E](#e2e)
10. [Rules and skills](#rules-and-skills)
11. [Claude Code hooks](#claude-code-hooks)
12. [Gotchas](#gotchas)

## What to install

| Tool             | Version                                     | What for                                                                         | How to install                                                                             |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Node.js          | 22 (see `.nvmrc`)                           | frontend, e2e, git hooks, formatting                                             | `nvm install` in the repository root                                                       |
| pnpm             | 10 (see `packageManager` in `package.json`) | Node dependencies (workspace: root, `frontend/`, `e2e/`)                         | `corepack enable` — it takes the version from `package.json`                               |
| uv               | 0.13+                                       | Python and backend dependencies; downloads Python from `backend/.python-version` | `curl -LsSf https://astral.sh/uv/install.sh \| sh`                                         |
| Docker + Compose | Docker Desktop or Docker Engine             | Postgres and the whole stack                                                     | WSL: in Docker Desktop enable Settings → Resources → WSL Integration for your distribution |
| make             | GNU make                                    | a single entry point for commands                                                | usually already there; Debian/Ubuntu: `apt install make`                                   |

## First-time setup

```sh
make install    # Node and backend dependencies, Playwright browser, git hooks
make dev-deps   # Postgres and Mailpit in Docker
make check      # everything must pass
make skills     # optional, for work with an AI agent: third-party skills
```

Besides the dependencies, `pnpm install` (inside `make install`) installs the git hooks: the
`prepare` script → husky sets `core.hooksPath=.husky/_`. Without it the hooks do not run and
errors show up only in CI.

## Running

**For development** — services run locally and reload on changes:

```sh
make dev-deps       # Postgres and Mailpit
make dev-backend    # terminal 1: migrations + uvicorn with reload on :8000
make dev-frontend   # terminal 2: http://localhost:5173
make dev-worker     # terminal 3, if you need emails: outbox → Mailpit, http://localhost:8025
```

`make dev-backend` runs uvicorn (ASGI), as in Docker, not `runserver`: `runserver` is WSGI, and
it sends an SSE stream (an async generator) only as a whole, that is, never. uvicorn runs with
`--timeout-graceful-shutdown 3` (in Docker too): otherwise `--reload` and `docker compose restart`
wait for open SSE streams forever. `--reload` watches only the code folders (`RELOAD_DIRS` in
the `Makefile`): watching all of `backend/` together with `.venv`, the uvicorn watcher takes
30–40 % of a core while idle, with both `StatReload` and `watchfiles`, and `--reload-exclude`
does not help. A new Django app has to be added to `RELOAD_DIRS`, otherwise its code does not
reload.

The frontend and the API are served from one address (:5173): Vite proxies `/api` to the
backend, so the session cookie and `EventSource` work without CORS. The backend address for the
proxy is the `API_PROXY_TARGET` variable (default `http://localhost:8000`).

**The whole stack in Docker** — the way a reviewer runs it:

```sh
make up     # build and start postgres, backend, worker, mailpit, frontend; http://localhost:5173
make demo-users  # demo accounts (once per new database)
make seed   # demo events with participants; each run adds two new ones
make logs   # logs of all services
make down   # stop; the database data stays in the postgres-data volume
```

`make demo-users` is needed once per new database. Running it again restores the demo passwords
if they were changed (this ends the sessions of that account); it leaves unchanged passwords and
open sessions alone.

`make seed` adds two events with participants (`@example.com`) to the demo organizer: a full one
in a week with a waitlist, and an event in ~23 h — ~30 s later the participants of the latter get
reminders (visible in Mailpit). Each run adds new events.

| Service  | Address                 | What it is                                                  |
| -------- | ----------------------- | ----------------------------------------------------------- |
| frontend | <http://localhost:5173> | Vue (Vite dev server); `/api` is proxied to the backend     |
| backend  | <http://localhost:8000> | Django + DRF under uvicorn; migrations are applied at start |
| postgres | `localhost:5432`        | PostgreSQL 17, user and password `postgres`                 |
| mailpit  | <http://localhost:8025> | SMTP trap: all emails land here (nothing goes out)          |
| worker   | —                       | sends emails from the outbox to Mailpit                     |

Ports are changed with the `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `MAILPIT_PORT`
(Mailpit web) and `MAILPIT_SMTP_PORT` variables.

- `make up` = `docker compose up -d --build --wait`: waits for the healthchecks of all services.
- `backend/Dockerfile`: Python 3.12 + uv, dependencies from `uv.lock` without the dev group; at
  start `migrate`, then uvicorn (ASGI — for SSE streams).
  The token from a ticket link does not get into the backend logs: the `config.log_redaction`
  filter replaces it with `<token>` in the uvicorn and `runserver` (`django.server`) access logs
  and in `django.request` warnings ("Not Found"). That is why both access logs are described
  anew in `LOGGING` (`config/settings.py`) with their own formats: Django applies it after
  uvicorn and after its own defaults, and a logger description replaces its handlers.
- `worker` is the same `backend` image with the `python manage.py run_worker` command: it takes
  batches of up to 20 emails from the outbox in a row and sends them to Mailpit; if there are no
  emails it waits 1 s. It starts after `backend` is healthy (migrations applied) and after
  Mailpit, and restarts after a crash (`restart: unless-stopped`). The log has only email `id`s
  and the error class, no addresses or links. An email that did not go out (Mailpit stopped)
  stays `pending` and is retried after 30 s, 60 s, 120 s, 240 s; after 5 failures it is
  `failed`. `attempts`, `last_error` and the time of the next attempt are visible in the admin
  ("Outbox emails"). If Postgres is unavailable, the worker logs `Outbox poll failed` and retries
  after 5 s without exiting.
- Mailpit is an SMTP trap: emails do not go out, they are visible in the web UI at
  http://localhost:8025 (it is also the API for e2e). SMTP is published on :1025 for
  `make dev-worker`.
- `frontend/Dockerfile` is built from the repository root (the pnpm workspace and the lock file
  are there). The stage is the `FRONTEND_TARGET` variable (`build.target` in compose): `dev`
  (default) — the Vite dev server with `API_PROXY_TARGET=http://backend:8000`; `gateway` —
  `vite build` and nginx (`frontend/nginx.conf`) on the same port: serves `dist/` (an unknown
  path gets `index.html`) and proxies `/api`, `/admin`, `/static` to the backend with the
  client's `Host`. `gateway` is set by `make e2e` and `stack-e2e` (and by CI through `make e2e`):
  e2e goes through a buffering proxy, as in production. On slot 0 `make e2e` replaces the
  frontend of `make up` with the build, the next `make up` brings Vite back. The build does not
  check types — `make check` does.
- An SSE stream behind nginx: the backend sends `X-Accel-Buffering: no`. nginx buffering alone
  does not delay the stream, but together with gzip for `text/event-stream` it does, and without
  the header the snapshots do not arrive; the header is always needed, especially if compression
  is turned on in the proxy.
- `make up` and `make dev-*` take the same ports (5173, 8000): do not run them at the same time,
  or change the ports with the `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `MAILPIT_PORT`
  (web, 8025), `MAILPIT_SMTP_PORT` (1025) variables. Links in emails point to
  `http://localhost:${FRONTEND_PORT}`.
- Wipe the database data: `docker compose down -v`.

## Commands

The main entry point is `make`; `make help` prints all targets with descriptions. A new command
must appear both in the Makefile and in this table.

| Command                                                       | What it does                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Environment**                                               |                                                                                                                                                                                            |
| `make install`                                                | Node and backend dependencies, Playwright browser (chromium), git hooks                                                                                                                    |
| `make skills`                                                 | optional: the third-party agent skills from `skills-lock.json` (see "Rules and skills")                                                                                                    |
| `make dev-deps`                                               | start Postgres and Mailpit in Docker and wait until they are ready                                                                                                                         |
| `make dev-backend` / `make dev-frontend`                      | local dev servers (see "Running")                                                                                                                                                          |
| `make dev-worker`                                             | local email worker: outbox → Mailpit (`manage.py run_worker`)                                                                                                                              |
| `make up` / `make down` / `make logs`                         | the whole stack in Docker                                                                                                                                                                  |
| **Checks**                                                    |                                                                                                                                                                                            |
| `make check`                                                  | everything except running e2e: formatting, linters, types, schema, tests — the same as CI                                                                                                  |
| `make check-backend`                                          | ruff, mypy, migrations, schema, pytest                                                                                                                                                     |
| `make check-frontend`                                         | ESLint, vue-tsc, Vitest                                                                                                                                                                    |
| `make check-e2e`                                              | ESLint and tsc for the e2e test code (does not run the tests)                                                                                                                              |
| `make check-tooling`                                          | tests of the Claude Code hooks and `scripts/` (`node:test`)                                                                                                                                |
| `make check-readme`                                           | README and `docs/requirements.md`: every test in the "Requirements and tests" tables exists — file, function, title; test references outside the tables are not checked, so there are none |
| `make check-ci`                                               | GitHub Actions workflows: actionlint and that the action tags exist (needs network)                                                                                                        |
| `make format-check`                                           | Prettier: formatting of all files                                                                                                                                                          |
| `make lint-backend` / `typecheck-backend` / `test-backend`    | separately: ruff / mypy / pytest (pytest needs `make dev-deps`)                                                                                                                            |
| `make lint-frontend` / `typecheck-frontend` / `test-frontend` | separately: ESLint / vue-tsc / Vitest                                                                                                                                                      |
| `make migrations-check`                                       | fails if models are changed and no migration is created                                                                                                                                    |
| `make schema-check`                                           | fails if `openapi.yaml` or `schema.d.ts` are outdated or a view has no description for the schema                                                                                          |
| `make demo-users` / `make stack-demo-users SLOT=<N>`          | demo accounts in the running stack / in the slot's stack (see "Create an organizer")                                                                                                       |
| `make seed` / `make stack-seed SLOT=<N>`                      | demo events with participants in the running stack / in the slot's stack (see "Demo data")                                                                                                 |
| `make e2e`                                                    | start the stack (`make up`) with the nginx gateway and run Playwright against it                                                                                                           |
| `make stack-up` / `stack-e2e` / `stack-down` `SLOT=<N>`       | the slot's stack (see "E2E"): start / e2e against it / remove with volumes                                                                                                                 |
| `make stack-check SLOT=<N>`                                   | `make check` on the slot's Postgres instead of the Postgres from `make dev-deps`                                                                                                           |
| `make stack-check-backend SLOT=<N>`                           | `make check-backend` on the slot's Postgres                                                                                                                                                |
| `make review-worktree REF=<sha>` / `review-worktree-remove`   | a copy of the repository for the `reviewer` agent at commit `<sha>` / remove it                                                                                                            |
| **Changes**                                                   |                                                                                                                                                                                            |
| `make schema`                                                 | rebuild `backend/openapi.yaml` and the frontend types `schema.d.ts` after an API change                                                                                                    |
| `make fmt`                                                    | format everything: `eslint --fix`, Prettier, `ruff check --fix`, `ruff format`                                                                                                             |
| **Other**                                                     |                                                                                                                                                                                            |
| `make worktime`                                               | working time from the session markers in `decisions.md` (see "Commits, decisions, progress")                                                                                               |
| `make export-sessions`                                        | the project's Claude Code sessions as text in `docs/session/` (not committed) (see "Commits, decisions, progress")                                                                         |

Django commands run from `backend/` through uv: `uv run python manage.py <command>`.

## Working on a task

The order for a developer working on a task together with Claude Code. The agent follows the same
steps, but by its own instructions — the `feature-workflow` (a whole phase) and `session-handoff`
(start and end of work) skills and `AGENTS.md` (including its own stack slot); the commands of
this section do not apply to it.

**1. Find the task.** In [roadmap.md](roadmap.md) — the phase with the "in progress" status, and
in it the first unchecked task. The tasks of phases 1–7 are in `docs/features/<slug>/tasks.md`.
Before starting — `git pull` and a clean `git status`.

**2. A large phase has just started — spec and tasks first, code after.**

1. Read the phase's section in [architecture.md](architecture.md) and the requirements in
   [task.md](task.md).
2. Copy `docs/features/_template/spec.md` and `tasks.md` to `docs/features/<slug>/`.
3. Spec — up to 150 lines: model, invariants and what protects them, API, UI states, edge cases,
   acceptance scenarios. **Non-Goals are required** — a list of what we do not do, even though
   we will want to.
4. Tasks — "one task = one commit", each with "done when"; the first is a tracer bullet: one
   scenario end to end, from the model to the screen.
5. The project owner approves the spec and tasks before the first line of code. Commit —
   `docs: add <slug> spec and tasks`.

**3. Before the code.** Read the `AGENTS.md` of the folders the task touches and the
`docs/rules/` on the topic ([list](#rules-and-skills)). Find similar code and reuse it instead of
writing a second version of the same thing.

**4. Test first — for logic.** Backend services, pure functions, transformations: the test comes
first, it must fail for the expected reason, then the code. Markup and styles are checked by the
browser and e2e. API and model changes follow the recipes from "[Common tasks](#common-tasks)".

**5. Check.**

- `make check` — always;
- `make e2e` — if the API, the UI or scenarios from `e2e/` are touched;
- by hand in the browser (`make dev-backend` + `make dev-frontend`): the task's scenario and the
  negative cases — empty data, an error, a repeated submit, two tabs.

**6. Update in the same commit** — checklist:

- [ ] the task is checked `[x]` in the roadmap or in the phase's `tasks.md`;
- [ ] decisions made along the way are in [decisions.md](decisions.md) (time from `date`);
- [ ] a new command, tool, check, gotcha is in this file;
- [ ] the behavior diverged from the spec — `spec.md` is fixed;
- [ ] whatever was found outside the task goes to "Later" in `tasks.md`, not into this commit.

**7. Commit** — one task, one message in the Conventional Commits format. If `pre-commit` or
`commit-msg` stopped the commit, fix the cause, do not bypass the hook.

**8. Push.** `git push`: `pre-push` checks the affected parts, then CI — the result is in Actions
on GitHub or in `gh run watch`. A red CI is the first task before taking the next one. A phase
stage is a branch from `main` and a pull request; the PR title follows the rule in
[AGENTS.md](../AGENTS.md) ("Small commits"). CI on a PR additionally checks the messages of all
commits.

**9. Close the phase** when all its tasks are checked:

- the phase criteria from the roadmap are verified with facts — a test, a command, an output;
- the phase's sections in [architecture.md](architecture.md) are brought in line with the code
  and marked "implemented";
- "What works" and the "requirement → test" rows in the [README](../README.md) and
  [requirements.md](requirements.md) are updated;
- in the roadmap the phase is "done", the next one is "in progress"; the closing is an entry in
  [decisions.md](decisions.md);
- an independent review of each stage: a human or the `reviewer` agent (what to give it — the
  `feature-workflow` skill, "Review"); a human goes through the findings.

What a phase's history looks like:

```text
docs: add registration spec and tasks
feat(backend): register for an event with a seat limit        ← tracer bullet
feat(backend): put registrations over the limit on the waitlist
feat(backend): promote the first waitlisted on cancellation
test(backend): race for the last seat on Postgres
feat(frontend): event page with registration form
test(e2e): organizer creates an event, participant registers
docs: close phase 1 (registration)
```

## Common tasks

**Change the API** (serializer, view, URL):

1. Backend code and test.
2. A response not from a serializer, several statuses or a stream — describe it with
   `@extend_schema` (example — `backend/config/health.py`).
3. `make schema` — updates `backend/openapi.yaml` and `frontend/src/shared/api/schema.d.ts`.
4. `make check-frontend`: if the frontend uses a changed field, vue-tsc fails — that is the
   contract check.
5. The schema and types go in the same commit as the code.

**Change database models:**

1. `cd backend && uv run python manage.py makemigrations <app> --name <what_was_done>`.
2. Look at the SQL: `uv run python manage.py sqlmigrate <app> <number>`.
3. Rules (do not edit committed ones, schema and data separately) —
   [rules/db-migrations.md](rules/db-migrations.md).

**Create an organizer** (admin login and organizer screens):
`cd backend && uv run python manage.py createsuperuser`. The demo accounts `demo@example.com` /
`demo` and `admin@example.com` / `admin` are created by `python manage.py create_demo_users`
(idempotent, restores the demo passwords if they were changed): in the stack — `make demo-users`
after `make up`, in a slot's stack — `make stack-demo-users`; `make e2e` and `stack-e2e` call it
themselves, it does not run at `backend` start. The command does not change a password that
already matches: a new hash even of the same password ends all sessions of the account (Django
binds a session to the hash). With `DJANGO_DEBUG=false` the command creates nothing and changes
no passwords, it only prints a warning: known passwords and a superuser must not get into a
deployment without DEBUG.

**Demo data:** `make seed` (`python manage.py seed_demo`; in a slot's stack — `make stack-seed`)
creates the demo accounts and adds two events to the demo organizer: in a week with 2 seats
(2 confirmed, 1 on the waitlist) and in ~23 h with 10 seats and 3 participants who got their
seats two days earlier. Registrations go through `register`, so ticket emails go out, and ~30 s
later (the worker's reminder pass) three reminders arrive in Mailpit. The command is not
idempotent: each run adds new events, so the "tomorrow" event is always fresh. With
`DJANGO_DEBUG=false` it creates nothing. Links in reminders are rendered by the worker, so
`FRONTEND_URL` in `docker-compose.yml` is set for it too.

**Run a single test:**

- backend: `cd backend && uv run pytest accounts/tests/test_user.py -k lowercase`;
- frontend: `cd frontend && pnpm test src/pages/health`;
- e2e: `cd e2e && pnpm test tests/smoke.spec.ts` (`--headed` — with a window, `--debug` — the
  debugger).

## Automatic checks

| When         | Hook         | What it checks                                                        |
| ------------ | ------------ | --------------------------------------------------------------------- |
| `git commit` | `pre-commit` | lint-staged — only the changed files, see the table below             |
| `git commit` | `commit-msg` | commitlint: the message is in the Conventional Commits format         |
| `git push`   | `pre-push`   | `scripts/pre-push.mjs`: checks of the parts the pushed commits change |
| push / PR    | CI           | `make check` and `make e2e` on GitHub Actions                         |

**`pre-commit` (lint-staged).** Fixes are added to the commit; what cannot be fixed automatically
stops the commit.

| Files                       | What runs                         |
| --------------------------- | --------------------------------- |
| `backend/**/*.py`           | `ruff check --fix`, `ruff format` |
| `frontend/**/*.{ts,vue,js}` | `eslint --fix`, Prettier          |
| `e2e/**/*.{ts,js}`          | `eslint --fix`, Prettier          |
| `*.{mjs,json,md,yml,yaml}`  | Prettier                          |

**`pre-push`.** Slow checks (types, tests) go here, not into `pre-commit`: a hook that slows down
every commit gets bypassed.

| Changed files                                                                                                 | What runs                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/**`                                                                                                  | `make dev-deps check-backend` — starts Postgres if it is not running; with `SLOT` set (an agent's push) — `make stack-check-backend SLOT=<N>` |
| `frontend/**`                                                                                                 | `make check-frontend`                                                                                                                         |
| `e2e/**`                                                                                                      | `make check-e2e`                                                                                                                              |
| `.github/**`                                                                                                  | `make check-ci`                                                                                                                               |
| `.claude/hooks/**`, `scripts/**`                                                                              | `make check-tooling`                                                                                                                          |
| `README.md`, `docs/requirements.md`, `backend/**`, `frontend/**`, `e2e/**`                                    | also `make check-readme`: a renamed test breaks a reference in the tables                                                                     |
| `Makefile`, `docker-compose.yml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.prettierrc.json` | checks of all parts                                                                                                                           |
| documentation only                                                                                            | nothing                                                                                                                                       |

The pushed commits are those from what is already on the remote up to the pushed one. A branch
that is not on the remote yet is compared with what is on any remote; if the remote is empty,
everything is checked. A new part of the repository is added to `PARTS` in
`scripts/pre-push.mjs` together with a row in `pre-push.test.mjs`.

**CI** — `.github/workflows/ci.yml`, on push to `main` and on pull requests. The commands are the
same as locally: there should be no difference between "passes for me" and "fails in CI".

| Job      | What it does                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `checks` | `pnpm install --frozen-lockfile`, `uv sync --frozen`, `make dev-deps`, `make check`; on a PR — commitlint over all PR commits |
| `e2e`    | Playwright browser, `make e2e` (the whole stack in Docker); on failure — service logs and the Playwright report as artifacts  |

`--frozen-lockfile` / `--frozen`: if `package.json` or `pyproject.toml` is changed without
updating the lock file, CI fails. The workflow is checked by `make check-ci` (part of
`make check` and of `pre-push` when `.github/` changes): actionlint — syntax and expressions,
`scripts/check-action-refs.mjs` — that every `uses: owner/repo@ref` has such a tag or branch.
actionlint does not check that: it let `astral-sh/setup-uv@v10` through, and CI failed — the
project does not publish major tags, only full versions.

`actions/checkout` in the `checks` job takes the full history (`fetch-depth: 0`): by default the
clone is shallow, the PR's base commit is not in it, and commitlint fails with
`Invalid revision range` although `make check` passed.

We do not bypass hooks (`--no-verify`): if a check gets in the way, we fix the cause or discuss
the rule.

## Commits, decisions, progress

**Commits** — [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <subject>`, in English, in the imperative mood.

```text
feat(backend): add waitlist promotion on cancel
fix(frontend): show error when check-in code is empty
docs: describe pre-push hook
```

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`,
  `revert`.
- Scope is the part of the repository: `backend`, `frontend`, `e2e`, `infra`; for changes across
  the whole repository it is omitted.
- One commit is one logical change after which the project builds and the tests pass.

**Decisions** — any choice that affects the code, structure, stack or deadlines is written to
[decisions.md](decisions.md) in the same commit as the change. The format is in
[AGENTS.md](../AGENTS.md).

**Working time** — session boundaries are marked in [decisions.md](decisions.md) with the lines
`- **HH:MM** — ▶ session start` and `- **HH:MM** — ■ session end` (time from `date`);
`make worktime` sums the intervals. A session may cross midnight — the date is taken from the day
heading above the marker. An unpaired marker gives a warning, not a silent zero; an unclosed
session is not counted. A daylight saving change inside a session is not corrected. To cross-check
— the time of the first and last commit of the day (`git log`).

**Progress** — [roadmap.md](roadmap.md): phases with a status and criteria, tasks with
checkboxes. A task is checked in the same commit that does it.

**Agent session export** — `make export-sessions` (`scripts/export-sessions.mjs`): each Claude
Code session of this project (`~/.claude/projects/<project path, everything except letters and
digits replaced with "-">/*.jsonl`) as text in a format close to `/export`, in `docs/session/` (git-ignored: the exports are raw
transcripts and are not committed).
The built-in `/export` exports only the current session, and opening an old one with `--resume`
for the sake of an export appends to it. The sources are only read. As with `/export`, the
model's thinking and subagent conversations are left out, as well as what the environment adds to
a request: background task notifications, IDE context, the output of commands after `!` (the
command itself stays). The file name is `YYYY-MM-DD-HHMM-<working time>.txt`: the local time of
the first message and the sum of the pauses between the messages of the main session, each capped
at 15 minutes (`48m`, `2h05m`). The time is approximate: a session left open overnight does not
count as a day of work, but a reading pause longer than 15 minutes is cut too. The files sort by
time. To add new sessions to the folder, run `make export-sessions` again: it overwrites the
files, adds new sessions and removes the previous export of the same session (same start,
different working time), and leaves other files alone — the export of a session whose `.jsonl`
Claude Code has already deleted stays. A running session is exported up to its last written
message. Another sessions or output folder — `node scripts/export-sessions.mjs <.jsonl folder>
<destination>`. The text keeps whatever was in command output, local paths included.

## Backend

- Structure: `backend/config/` — settings, root URLs, ASGI, `health.py`; Django apps are folders
  next to it (`accounts/`). Python 3.12, Django 5.2 LTS, DRF.
- Environment variables are read only in `config/settings.py`. The defaults match the
  `docker compose` services, so nothing has to be set locally.
- Email: `EMAIL_HOST` / `EMAIL_PORT` (Mailpit SMTP, default `localhost:1025`),
  `DEFAULT_FROM_EMAIL`, `FRONTEND_URL` — the frontend address for links in emails (default
  `http://localhost:5173`). Emails are not sent from a request: a service puts them into the
  outbox (`emails.services.enqueue_email`) in its own transaction. In tests pytest-django itself
  replaces the email backend with `locmem`.
- The SMTP timeout is `EMAIL_TIMEOUT = 10` s, a constant in `settings.py`, not from env: a server
  that accepted the connection and stays silent would otherwise hold the worker's batch and its
  locks forever. A timeout is an ordinary failed attempt with a retry.
- A custom user model `accounts.User`: login by email, no username. The email is stored in lower
  case (normalized in `save()`), so a plain `unique` works case-insensitively. Dots and `+tag` in
  the address are significant — see the 2026-10-28 22:38 entry in [decisions.md](decisions.md).
- Tests — pytest + pytest-django on a real Postgres (`make dev-deps`): locks, `SKIP LOCKED` and
  `LISTEN/NOTIFY` cannot be tested on SQLite. pytest-django creates a separate test database
  `test_<name>` and drops it after the run. A test that needs the database is marked
  `pytest.mark.django_db`.
- Async tests (SSE streams) — pytest-asyncio in `auto` mode, without a marker: `async def
test_…` and `django.test.AsyncClient`. There is one event loop per session, like the one loop
  of the uvicorn process where the `LISTEN` listener lives (`events/realtime.py`). A stream test
  is `django_db(transaction=True)`: the stream reads the snapshot in another thread with its own
  connection and sees only what is committed. Error responses (401/403/404) of a stream are
  checked with the synchronous `APIClient`: `AsyncClient` does not close the connection of a
  non-streaming response, and it keeps the test database from being dropped at the end of the
  run.
- mypy in `strict` mode with the django-stubs and drf-stubs plugins. Django generic classes
  (`UserAdmin[User]`) work at runtime thanks to `django_stubs_ext.monkeypatch()` in the settings.
  `# type: ignore` — only with an error code and a reason in a comment.
- ruff: rules `E, F, W, I, B, UP, DJ, S, SIM, RUF`. Migrations are formatted but not linted
  (generated code). Tests may use `assert` and passwords in code.
- The API is described by the OpenAPI schema `backend/openapi.yaml` (drf-spectacular); it is
  committed, and the frontend gets its types from it (see "Change the API"). Generation runs with
  `--fail-on-warn`: a view without a response description or an ambiguous enum name is an error,
  not a silent gap in the schema.
- Static files (admin) are served by WhiteNoise — the same way under uvicorn, `runserver`
  (`whitenoise.runserver_nostatic`) and in tests: files with a hash in the name from
  `STATIC_ROOT` (`backend/staticfiles/`, built by `collectstatic`, not in git). The image collects
  static files at build time; pytest does it once per session (a fixture in
  `backend/conftest.py`), because tests run with `DEBUG=False`, like production.
- The admin is at <http://localhost:8000/admin/> (directly on the backend: Vite proxies only
  `/api`); login by email, `is_staff` is required. Every model of our apps must be registered in
  the admin — a test checks it.
- `GET /api/health/` — a check of the process and the database: 200
  `{"status": "ok", "database": "ok"}` or 503 if the database is unavailable. Used by the compose
  healthchecks, e2e and the frontend.

## Frontend

- Vue 3 + Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`), vue-router,
  `@tanstack/vue-query` for server data.
- Feature-Sliced Design layers in `frontend/src/`: `app` (application, router, QueryClient) →
  `pages` → `widgets` → `features` → `entities` → `shared`. Imports go only to lower layers, and
  into another slice only through its `index.ts`. ESLint checks it (`eslint-plugin-boundaries`).
  The `widgets`, `features`, `entities` layers appear with their first slice — they are not
  created empty.
- API: `api` from `@/shared/api` — an openapi-fetch client typed by `schema.d.ts` (generated by
  `make schema`, not edited by hand). A nonexistent path, method or field is a vue-tsc error.
  `unwrap()` turns a response into data or an `AppError`; above `shared/api` errors differ only
  by `kind` (`network`, `unauthorized`, `not_found`, `conflict`, `validation`, `server`, …).
- Request retries (vue-query) — only for `network` and `server`: a retry will not fix a 4xx.
- Tests: Vitest + `@vue/test-utils` in jsdom, the network is MSW. Each test declares its own
  network with `server.use()`; a request without a handler fails the test. Example —
  `src/pages/health/ui/HealthPage.test.ts`.
  An MSW response arrives later than one tick: after an action wait for the result
  (`vi.waitFor`, `queryClient.isMutating()` for the end of a mutation with its invalidations),
  not `flushPromises()`. Check a flaky test by repeating it in one process
  (`pnpm vitest run <file> -t "<test>" --repeats 30 --maxWorkers 2`), not with several
  `pnpm test` at once: each has up to ~12 workers with jsdom, and three parallel runs brought down
  WSL with 16 GB of memory.
- ESLint with type-aware rules: `no-floating-promises`, `no-misused-promises`,
  `switch-exhaustiveness-check`, `consistent-type-imports`, no `any`.
- UI components — shadcn-vue (Reka UI + Tailwind CSS v4). The component code lives in the
  repository: `src/shared/ui/shadcn/` (generated, the ESLint rules for it are relaxed in
  `eslint.config.js`); `src/shared/ui/` outside that folder holds hand-written components. Add a
  component: `cd frontend && pnpm dlx shadcn-vue@latest add <name>` — only one that has a
  consumer. Configuration — `frontend/components.json`; `cn()` is in
  `src/shared/lib/class-names.ts`. Design tokens are CSS variables in `src/app/styles.css`
  (`:root`). CLI gotchas: it needs `paths` in `frontend/tsconfig.json` (without it, it fails with
  `resolvedPaths: Required`); when the alias does not match, it puts the npm package `cn` into
  the imports — after `add` check `grep -r 'from "cn"' src` and the dependencies in
  `package.json`.
- The interface texts are in English, through vue-i18n: each component has its own
  `<i18n lang="json" locale="en">` block next to the template (`useI18n({ useScope: "local" })`).
  The app locale is `en-GB` (24-hour time, the day before the month). The blocks are collected by `@intlify/unplugin-vue-i18n` (`vite.config.ts`). There are no global
  messages; the instance is created by `createAppI18n()` from `shared/lib/i18n.ts` — component
  tests use it too. Keys in `t()` are not type-checked: a typo is caught by the component test.
  `@` in a message is written as `{'@'}`. Code, identifiers and logs are in English.

## E2E

- Playwright, the `e2e/` package, chromium only. The tests run against the `make up` stack, but
  with the frontend behind the nginx gateway: `make e2e` and `stack-e2e` start it themselves with
  the `gateway` stage (see "Running"), on slot 0 — instead of Vite from `make up`. Another
  address — `E2E_BASE_URL`.
  The tests read emails through the Mailpit API: `E2E_MAILPIT_URL` (default
  `http://localhost:8025`; `make stack-e2e` passes the Mailpit of its slot). The mailbox is shared
  and not cleaned — a test finds its email by a unique recipient address.
- Slots let a human, an agent and a reviewer work at the same time. A slot is the compose project
  `event-registration-s<N>` with its own containers, volumes and ports: each port is the default
  port plus the slot number. Targets: `make stack-up` / `stack-e2e` / `stack-check` /
  `stack-down`, the slot is `SLOT=<N>` (default 1). `stack-check` is `make check` on the slot's
  Postgres: otherwise the backend tests would recreate `test_event_registration` in someone
  else's Postgres. `stack-down` removes only its own slot's volumes. The sources are not mounted
  into the slot's containers — the code is built into the image: after an edit run
  `make stack-up` again (or `stack-e2e`, which calls `stack-up`), otherwise the browser shows the
  old version. Demo accounts in a new slot volume — `make stack-demo-users` (`stack-e2e` calls it
  itself).

  | Slot | Who                          | Frontend | Backend | Postgres | Mailpit | SMTP |
  | ---- | ---------------------------- | -------- | ------- | -------- | ------- | ---- |
  | 0    | human: `make up`, `dev-deps` | 5173     | 8000    | 5432     | 8025    | 1025 |
  | 1    | the agent's main session     | 5174     | 8001    | 5433     | 8026    | 1026 |
  | 2    | the `reviewer` agent         | 5175     | 8002    | 5434     | 8027    | 1027 |

- The reviewer checks commits in its own copy of the repository: `make review-worktree REF=<sha>`
  creates a worktree in `.claude/worktrees/review` (the folder is in `.gitignore`) and installs
  the dependencies from the pnpm and uv caches — about 5 s; `make review-worktree-remove` removes
  it. Without a copy the reviewer's checks would run on the author's uncommitted edits. Symlinks
  to the main folder's `node_modules` and `.venv` were rejected: if the dependencies changed in
  the reviewed range, the reviewer would silently check with the old ones.
- On failure a trace is saved:
  `cd e2e && pnpm exec playwright show-trace test-results/<test folder>/trace.zip`.
- `make check` does not run e2e (it needs a running stack) — only ESLint and tsc for their code.
  The main linter rule here is `no-floating-promises`: a forgotten `await` in Playwright makes a
  test green without checking anything.

## Rules and skills

The code conventions are written as rules for the agent, but they apply to people too — they are
worth reading.

| File                                                                      | About                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [AGENTS.md](../AGENTS.md)                                                 | the whole repository: decision log, commits, language, checks              |
| [backend/AGENTS.md](../backend/AGENTS.md)                                 | thin views and `services.py`, env, API and schema, tests, time, logs       |
| [frontend/AGENTS.md](../frontend/AGENTS.md)                               | FSD layers, network through `shared/api`, UI states, names, tests          |
| [frontend/src/shared/api/AGENTS.md](../frontend/src/shared/api/AGENTS.md) | the API client, `AppError`, generated types                                |
| [e2e/AGENTS.md](../e2e/AGENTS.md)                                         | `await`, waiting without `sleep`, locators, independent data, two contexts |
| [rules/db-migrations.md](rules/db-migrations.md)                          | database migrations                                                        |

A rule for a folder is an `AGENTS.md` in it (next to it, `CLAUDE.md` = `@AGENTS.md`, which
Claude Code reads); a rule on a topic is `docs/rules/<topic>.md`.

Procedures ("how to do X step by step") are skills in `.claude/skills/`: `session-handoff`,
`feature-workflow`, `fsd-frontend`, `anti-slop-review`, `api-change`; the independent review
agent is `.claude/agents/reviewer.md`. The source is the
[rbikbov/frontend-starter](https://github.com/rbikbov/frontend-starter) template, adapted to
Django + Vue. The templates of a phase's spec and tasks are in `docs/features/_template/`.

Third-party skills (`django-security`, `vue-best-practices`, `vue-router-best-practices`,
`vue-testing-best-practices`) are not in git and are optional: `make skills` installs them with
`npx skills@1.9.0 experimental_install` (the CLI pinned too) from `skills-lock.json`, which pins
each one to a commit of its source, into `.agents/skills/` with symlinks in `.claude/skills/` (both
git-ignored; it needs network). A clone made while they were in git loses them on update — run
`make skills` again. They are not edited: `npx skills update` moves them to newer versions and
rewrites the lock file. Project-specific additions go into `AGENTS.md` or our own skills. Without
them the agent still works by the project's rules (no rule refers to them); they add general Vue
and Django advice. On Windows the symlinks need developer mode — work from WSL.

## Claude Code hooks

Configured in `.claude/settings.json`, the scripts are in `.claude/hooks/` (Node, no
dependencies). They apply only to the agent and do not affect manual work.

| Event                      | Script                 | What it does                                                                                                                        |
| -------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`             | `session-start.mjs`    | shows the agent the phase "in progress", its open tasks from `tasks.md` (or a hint to start with the spec) and the latest commits   |
| `PreToolUse` (Bash)        | `guard-bash.mjs`       | blocks bypassing git hooks (`--no-verify`, `-n`, `HUSKY=0`, changing `core.hooksPath`), force push and `--amend` of a pushed commit |
| `PreToolUse` (Edit/Write)  | `guard-migrations.mjs` | blocks edits of committed migrations `backend/*/migrations/NNNN_*.py`                                                               |
| `PostToolUse` (Edit/Write) | `format-file.mjs`      | formats the changed file like `pre-commit` (Prettier, ruff, ESLint); shows the agent the remaining linter errors                    |

- `guard-bash.mjs` first cuts heredocs and quoted strings out of the command (otherwise `-n` in
  the text of a commit message would act as a flag), then checks each simple command (separators
  — newline, `;`, `|`, `&`) separately. A new case is a row in `guard-bash.test.mjs`.
- Hooks on Edit/Write do not see a file edited through the shell (`sed -i`, `>`). The rules still
  apply, but following them in that case is up to the agent and the review.
- Hooks are picked up when `.claude/settings.json` changes, without restarting the session. If a
  hook blocks too much, fix the script and add the case to the test instead of bypassing the hook.

## Gotchas

**Environment and checks**

- `pre-push` checks the **working copy**, not the contents of the pushed commits: that is how git
  hooks work. Uncommitted changes can both fail a push and mask an error in a commit. It is
  better to have a clean `git status` before a push; CI checks the commits as they are.
- The generated `backend/openapi.yaml` and `frontend/src/shared/api/schema.d.ts` are excluded
  from Prettier and ESLint: `make schema-check` compares them with the generation byte for byte.
- `docs/task.md` is the original brief; its meaning is not edited.
- In WSL2 the wall clock (`time.time()`, `timezone.now()`) jumps back by about 0.4 s every ~30 s,
  even without load: that is how the host adjusts the virtual machine's clock. A test that queues
  an email and immediately calls `process_batch()` with the current time may find it "from the
  future" and not send it, and emails created in a row may get timestamps out of id order. So the
  test itself sets the time and order of the timestamps it needs: the "emails are already due"
  moment goes into `now` (`due()` in `backend/emails/tests/test_worker.py`), the order — through
  explicit `next_attempt_at` (`queue_in_order()` in the same file).
- pnpm runs install scripts only for packages from `pnpm.onlyBuiltDependencies` in the root
  `package.json` (`unrs-resolver` — the import resolver for ESLint, `vue-demi`).

**Docker**

- The frontend healthcheck calls `127.0.0.1`, not `localhost`: in Alpine `localhost` resolves to
  IPv6 `::1`, and Vite listens only on IPv4 — the check failed while the server was running.
- If chromium for e2e does not start on Linux because of system libraries:
  `cd e2e && pnpm exec playwright install --with-deps chromium` (needs sudo).

**Frontend versions and libraries**

- TypeScript is pinned to `~6.0`: typescript-eslint supports TypeScript `<6.1`, and TypeScript 7
  (the Go compiler) has a different API that neither typescript-eslint nor vue-tsc supports yet.
  openapi-typescript warns about the `typescript@^5` peer, but generation works with 6.0 (checked
  by `make schema-check`).
- The openapi-fetch client gets `fetch: (r) => globalThis.fetch(r)`: otherwise it captures
  `fetch` at import, MSW in tests is enabled later, and requests went to the real network.
- MSW 3: the option is called `onUnhandledFrame`, not `onUnhandledRequest` as in MSW 2 and in
  most examples on the internet.
