# Event registration — rules for the agent

An event registration service (the original brief — [docs/task.md](docs/task.md)). A monorepo:
`backend/` — Django + DRF, `frontend/` — Vue 3, `e2e/` — Playwright. This file is read at the
start of every session, so it holds only what is always needed. The details are in the folders'
`AGENTS.md` (loaded when working in the folder) and in `docs/rules/`.

Commands (`make help`), tools and checks — [docs/development.md](docs/development.md); skills and
Claude Code hooks — [docs/ai-workflow.md](docs/ai-workflow.md).
Before saying a task is done — `make stack-check` (that is `make check` on slot 1's Postgres in
Docker; it needs network: `check-ci` checks the action tags against GitHub).

The human, the agent and the reviewer work at the same time, each in their own slot (the table —
[docs/development.md](docs/development.md), "E2E"): slot 0 — the human (`make up`,
`make dev-deps`, `make check`, `make e2e`), slot 1 — the agent (`make stack-*`), slot 2 — the
`reviewer` agent. The agent does not run slot 0 targets or other slots: those are other people's
stacks and databases. Separate checks with the database (`make check-backend`,
`make test-backend`, `uv run pytest`) — with `POSTGRES_PORT=5433` or `make stack-check-backend`;
slot 1's Postgres is started by `make stack-check`, `make stack-check-backend` and `make stack-up`.
Push — `SLOT=1 git push`: the `pre-push` hook checks the backend on slot 1's Postgres, not on the
human's Postgres.
How the system works and what is planned — [docs/architecture.md](docs/architecture.md). Where the
work stopped — [docs/roadmap.md](docs/roadmap.md); how to maintain it — the `session-handoff`
skill.

## Map

```text
backend/              Django + DRF: config/ — settings and URLs, accounts/ — the user and login,
                      events/ — events and SSE streams, registrations/ — registrations, the
                      waitlist, check-in, reminders, emails/ — the outbox and the worker.
                      Rules: backend/AGENTS.md
frontend/             Vue 3 + Vite, FSD layers in src/: app, pages, entities, shared
e2e/                  Playwright; rules — e2e/AGENTS.md
Makefile              all commands (make help); docker-compose.yml — the services
scripts/              repository scripts with tests: pre-push.mjs, worktime.mjs,
                      check-action-refs.mjs, check-readme-tests.mjs, export-sessions.mjs
docs/task.md          the original brief — its meaning is not edited
docs/decisions.md     the decision log with the time
docs/development.md   the developer guide: setup, commands, checks, gotchas
docs/requirements.md  the general requirements and the detailed "requirement → test" table
docs/ai-workflow.md   how it was built with AI: tools, agent rules, skills, hooks
docs/architecture.md  how the system works: model, API, realtime, emails; section status
docs/roadmap.md       phases, statuses, criteria; the phases' specs and tasks — docs/features/<slug>/
docs/rules/           rules by topic: db-migrations.md, concurrency.md
.claude/settings.json Claude Code hooks; the scripts — .claude/hooks/
.claude/skills/       the agent's procedures (skills)
```

## Rules that always apply

1. Do not claim that checks pass without running them. In the output of tests and linters read the
   errors, not the whole log.
2. Do not bypass hooks and checks: no `--no-verify`, no disabling linter rules or weakening types.
   A deviation from a rule — with a reason in the code or in the decision log.
3. Nothing "for the future": no layers, settings or abstractions without a consumer.
4. Three failed attempts to fix the same thing — stop and describe to the human what was tried and
   what the hypothesis is.
5. A new command, tool, check or environment gotcha — into
   [docs/development.md](docs/development.md) in the same commit; a skill or a Claude Code hook —
   into [docs/ai-workflow.md](docs/ai-workflow.md).
6. A phase stage is not done until the `reviewer` agent has gone through it and the human has gone
   through its findings. How to hand it over — the `feature-workflow` skill, "Review".

## Decision log — `docs/decisions.md`

- Each decision made in a discussion with an AI agent is written to
  [docs/decisions.md](docs/decisions.md) right away — in the same step where the decision is made,
  not later.
- A decision is any choice that affects the code, the structure, the stack, the scope or the
  deadlines: what was chosen, what was rejected. Small edits without a choice (a typo, a rename)
  are not decisions.
- The time is Europe (EET/EEST), taken from `date`, not guessed. The entry format:
  `- **HH:MM** — decision. Why: …` under the day heading `## YYYY-MM-DD`.
- State the rejected options and the reason, if they were discussed.
- Past entries are not rewritten; if a decision changed — a new entry with a reference to the old
  one ("cancels the decision of HH:MM").

## Working time accounting

- At the start of a session (including after `/clear`) — the entry `- **HH:MM** — ▶ session start`
  in [docs/decisions.md](docs/decisions.md), in the last commit of the session —
  `- **HH:MM** — ■ session end`. The time is from `date`. The sum — `make worktime`.
- If the previous session was left without `■`, close it with the time of the last commit and tell
  the human.

## Small commits

- One commit — one logical change, after which the project works (builds, the tests pass).
- Commit right after finishing a step, do not accumulate several changes in one commit.
- An entry in `docs/decisions.md` goes in the same commit as the change it explains.
- A commit message — in English, in the imperative mood, briefly about what and why.
- The format — [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <subject>`. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`,
  `build`, `ci`, `chore`, `style`, `revert`. Scope — the affected part: `backend`, `frontend`,
  `e2e`, `infra` or a module; for changes across the whole repository the scope is omitted. A
  breaking change — `!` after the type and `BREAKING CHANGE:` in the body. commitlint checks the
  format.
- A phase stage — its own branch from `main` and one PR. The PR title — in English:
  `Phase <N>, stage <M>: <what was done>` (several stages — `stages 1–2`, a phase without stages —
  `Phase <N>: …`); a PR outside the phases — without a prefix and without a Conventional Commits
  type.

## Language

- Documentation (`README.md`, `docs/`, `AGENTS.md`) — in English.
- Code (identifiers, comments, log strings) and commit messages — in English.
- The interface texts and the emails — in English (`frontend/AGENTS.md`, rule 5;
  `backend/emails/templates/emails/`).

## Skills and agents

| Skill / agent      | When                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `session-handoff`  | the start and end of a session, after a roadmap task, closing a phase                               |
| `feature-workflow` | the start of a roadmap phase: spec → tasks → tracer bullet → test first → review → browser          |
| `fsd-frontend`     | frontend code: layers, connecting slices, state, errors, tests                                      |
| `anti-slop-review` | before committing a large change and before a demo or a release: junk and unbacked claims           |
| `api-change`       | an API change: serializer, view or URL → test → `openapi.yaml` → frontend types → call              |
| `reviewer` agent   | an independent review of a stage or a phase with a clean context; without subagents — a new session |

The project's skills are in `.claude/skills/<name>/SKILL.md`, the agent — in
`.claude/agents/reviewer.md`. An agent without skills support (Codex, Antigravity) reads the
`SKILL.md` from there by the table above. Without subagents a review is a new session: the prompt is
the text of `reviewer.md` after the frontmatter, the first step is reading
`.claude/skills/anti-slop-review/SKILL.md`, then the same inputs as for the agent (the
`feature-workflow` skill, "Review").

## Rule files

The text of the rules is in `AGENTS.md` (other agents read them too). Next to it lies a one-line
`CLAUDE.md` with `@AGENTS.md`: Claude Code loads only `CLAUDE.md`. New rules for a folder are
created as an `AGENTS.md` + `CLAUDE.md` pair, rules on a topic — in `docs/rules/<topic>.md`.
