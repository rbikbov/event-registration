---
name: session-handoff
description: >
  The start and the end of a work session: check against the roadmap, check off the done tasks,
  check that the decisions are written to the log, update "What works" in the README and the
  requirement tables when a phase is closed. Use at the start of a session, after /clear, after each commit with
  a roadmap task and before ending a session.
---

# Handing over the state between sessions

The state of the work lives in the repository, not in the chat. A new session must understand where
the work stopped from the files alone.

| File                                | What it holds                                                             |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `docs/roadmap.md`                   | phases, their status and criteria                                         |
| `docs/architecture.md`              | how the system works; the sections have the status "implemented" / "plan" |
| `docs/features/<slug>/tasks.md`     | the phase's tasks and the "later" log                                     |
| `docs/decisions.md`                 | why it was decided so                                                     |
| git history                         | what was done and when                                                    |
| `README.md`, `docs/requirements.md` | the outcome for the reader: what works, "requirement → test" tables       |

## Session start

0. If the last session in `docs/decisions.md` is not closed (`make worktime` shows a warning),
   close it with the `■ session end` marker with the time of the last commit and tell the human.
   Then put `▶ session start` with the time from `date`.
1. The `SessionStart` hook has already printed the phase "in progress" and the latest commits. If
   there is no output — read `docs/roadmap.md` and `git log --oneline -10`.
2. Read the phase's `spec.md` and `tasks.md`.
3. `git status`: uncommitted changes come from an interrupted task. Figure out what they are before
   starting a new one.
4. The next task is the first unchecked one. A deviation from the order — tell the human.

## After a task (in the same commit)

1. Check the task `[x]` in the phase's `tasks.md`.
2. The decisions made along the way — into `docs/decisions.md` (the format — `AGENTS.md`).
3. A new command, tool, check or environment gotcha — into `docs/development.md`; a skill or a
   Claude Code hook — into `docs/ai-workflow.md`.
4. What was found outside the task — into the "later" log in the phase's `tasks.md`, not into this
   commit.

## Closing a phase

1. Verify the phase criteria from `docs/roadmap.md` by facts: a command, a test, an output.
2. `make stack-check` passes (`make check` — slot 0, the human's).
3. Bring the phase's sections in `docs/architecture.md` in line with the code and mark them
   "implemented".
4. Update "What works" in the README and the "requirement → test" rows for the phase's requirements (README
   — the items of the brief, `docs/requirements.md` — the rest) — with links to existing
   tests.
5. Change the phase status to `done`, the next one's to `in progress`.
6. Write the phase closing to `docs/decisions.md` if the scope or the criteria changed along the
   way.

## Session end

- The `- **HH:MM** — ■ session end` marker in `docs/decisions.md` — in the last commit of the
  session.
- Everything done is committed; an unfinished task is not checked, and its `tasks.md` (or a message
  to the human) has 1–2 lines: where the work stopped and what is next.
- To the human — the outcome: what was done (commits), what was checked and how, what remains.
