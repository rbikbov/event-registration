---
name: feature-workflow
description: >
  The process of developing a feature or a phase from docs/roadmap.md: spec → tasks one per commit →
  read-only research → tracer bullet → implementation with test first for logic → review by the
  reviewer agent by stage → a check in the browser. Use when a roadmap phase starts, a spec needs to
  be written or the work split into tasks, the work is bigger than one commit. Do not use for typos
  and one-line edits.
---

# Feature process

A lightweight adaptation of the `feature-workflow` skill from the `rbikbov/frontend-starter`
template. The principle: **the fewer decisions the agent makes on its own, the more stable the
result.** Each phase ends with an artifact and a check.

No PRD is written: the requirements are `docs/task.md`, the phase criteria are `docs/roadmap.md`
(decision of 2026-10-28 21:25). A spec and tasks — for every phase from the first, except the
skeleton (phase 0): the decision of 2026-10-31 06:19 cancels "only for the large mechanisms".

The phases are vertical: a phase includes the backend, its screens and the e2e of its scenarios (the
list of screens by phase — `docs/architecture.md`, "Frontend: screens"). A phase without its own
screen and e2e is not closed.

## Phases

| #   | Phase          | Artifact                                        | Approved by             | Check                                                                                    |
| --- | -------------- | ----------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| 0   | Preparation    | the base commit in the log                      | —                       | a clean `git status`; the phase in the roadmap is "in progress"                          |
| 1   | Spec           | `docs/features/<slug>/spec.md`, up to 150 lines | the human               | covers each criterion of the phase and nothing beyond                                    |
| 2   | Tasks          | `docs/features/<slug>/tasks.md`                 | the human               | one task — one commit; the first is a tracer bullet                                      |
| 3   | Research       | 2–3 lines in the log of `tasks.md`              | —                       | read-only; found what to reuse                                                           |
| 4   | Tracer bullet  | a commit                                        | —                       | one scenario works end to end and is visible in the browser                              |
| 5   | Implementation | a commit per task, e2e — as tasks of the stage  | —                       | logic — test first; `make stack-check` passes; API, UI or `e2e/` — also `make stack-e2e` |
| 6   | Review         | the report of the `reviewer` agent in full      | the human — on each one | the human's decisions on the findings are carried out                                    |
| 7   | Browser        | a pass in the browser on slot 1                 | —                       | the stage's scenarios pass without errors in the console                                 |

Phases 5–7 repeat for each stage of `tasks.md` (the first stage is the tracer bullet): the e2e of
the stage's scenarios are its tasks, so the review sees their code too, and the browser comes after
the review. Skipping a phase — out loud, not silently.

**Base.** At the start of a phase or a stage — a line in the log of `tasks.md`: "the base of stage
N — `<sha>`" (the last commit before the stage).
The review range is `<base>..<the last commit of the stage>`.

**Stack.** The agent's main session works in slot 1: `make stack-check` instead of `make check`,
`make stack-up` / `stack-e2e` / `stack-down`. Slot 0 (`make up`, `make dev-deps`) is the human's,
slot 2 is the `reviewer` agent's (the table — `docs/development.md`, "E2E").

## Spec

The template — `docs/features/_template/spec.md`.

- **Ask only what blocks.** Everything the brief and `architecture.md` do not define (field
  limits, response codes, paging, visibility) the agent decides itself with a reasonable default and
  writes into "Assumptions and open questions" — the human confirms them when approving the spec.
  Endless clarifying questions before the spec are worse.
- **Non-Goals are required:** what one will want to do "along the way" (caching, admin, refactoring
  neighboring code, layouts for new sizes). Without this list the feature grows.
- The contents: where the code lives (the Django app, the FSD slices), the data model and the
  migrations, the invariants and what protects them (a database constraint, a lock), the API (input,
  output, errors and statuses → `AppError.kind`), the UI states, edge cases, acceptance scenarios
  with the test level.
- The starting point is the phase's section in `docs/architecture.md`: the spec refines it rather
  than retells it. If the spec changes what was agreed there — tell the human.
- A long generated spec is worse than none: it clutters the context and blurs the decisions.
- **The spec lives together with the code:** the behavior changed — `spec.md` is fixed in the same
  commit.

## Tasks

The template — `docs/features/_template/tasks.md`. One task — one commit, after which the project
builds and the checks pass. Each task has "done when". The first task is the tracer bullet, then the
states, the edge cases, the polish.

## Tracer bullet

One scenario end to end: model → service → view → `openapi.yaml` → types → page → the result on the
screen. It is production code with the real contracts from the spec, but without detailed
validation, polishing of the states and styles.

## Implementation

- **Logic — test first:** backend services, pure functions, transformations. The test must fail for
  the expected reason, then the code is written. A test written after the code tends to check what
  the code does, not what is required.
- **Markup and styles — without test first:** the browser checks them, the critical path — e2e.
- After a task: `make stack-check` (if the API, the UI or `e2e/` changed — also `make stack-e2e`),
  a check in `tasks.md`, a commit (the `session-handoff` skill).
- **Stop:** three failed attempts to fix the same thing — stop and describe to the human what was
  tried and what the hypothesis is. Do not fit the tests to the code, do not disable rules, do not
  weaken types.
- What was found outside the task — into the "later" log in `tasks.md`, not into this commit.

## Review

The `reviewer` agent (`.claude/agents/reviewer.md`) with a clean context, after each stage. The
independence of the review rests on the prompt: the agent knows only what is in it.

Pass **only**:

- the path to `spec.md`;
- the stage's tasks — as text, lines from `tasks.md` without the log; do not pass the path to
  `tasks.md`: the log has the author's arguments;
- what is not done yet (the next stages) — their absence is not a finding;
- the range `<base>..<sha>` with an explicit end SHA.

Do not explain the decisions, do not retell the implementation, do not list what was done, do not
evaluate ("everything seems to work"), do not refer to `docs/decisions.md` — the agent reads it
itself after composing the findings. The environment (slots, the repository copy) is described in
the agent — do not repeat it.

```text
Review stage <N> of phase <M> (<the mechanism in one phrase>) in the repository <path>.

- Spec: <path to spec.md>.
- The stage's tasks:
  <task lines from tasks.md>
- Not done yet: <stages and tasks>; their absence is not a finding, unless this stage promised
  something from them.
- Range: <base>..<sha> (branch <name>).

Do not change files. The answer — in the format from your instructions.
```

**The report** is shown to the human in full, before one's own edits. Do not discard findings as
"unconfirmed" and do not sort them into "accepted / not accepted" — the author does not filter the
review of their own code. A fact may be added to a finding (a command, an output, a line of code),
but the human decides. The decisions on the findings — into `docs/decisions.md`.

**A repeated review** — after the fixes, only on the fix commits
(`<the last commit of the stage>..<sha>`). No more than one repeat; the remaining disputes are
decided by the human.

The human looks at security (sessions, cookies, CSRF, tokens in links, user input) themselves:
green checks do not guarantee it.

## Browser

On the slot 1 stack: `make stack-up` (on a new volume — also `make stack-demo-users`), the frontend
http://localhost:5174, emails — Mailpit http://localhost:8026; at the end `make stack-down`. Go
through the stage's scenarios, including the negative ones: empty data, a network error, a repeated
submit, two tabs. Watch the console and the request statuses. The critical path is covered by the
e2e tasks of the stage — they passed in `make stack-e2e` before the review.
**Done** when each criterion of the phase is checked; the final message lists the criteria and how
each one was checked.
