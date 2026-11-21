# Delivery: spec

Phase — `docs/roadmap.md`, phase 7. Status: approved 2026-11-04.

## What and why

The phase covers "What we expect from you" from `docs/task.md` and general requirements 6, 7, 12,
13: from the README the reviewer finds which test proves each requirement of the assignment, what
the project was built with and how, what state it is in and what is next. The product code changes
only where the cross-check finds a requirement without a test or the junk check finds junk.

## Non-Goals

- New product features, including those from "What's next" of the README (user sign-up, an event
  end time, a push server).
- Refactoring of code that the junk check did not flag.
- Raw `.jsonl` files in the repository: the human hands them over personally.
- Deploying anywhere other than a local run.

## Requirements of the assignment → tests

Now the README table is built by the phases' mechanisms (54 rows). The reviewer goes from the text
of the assignment, so above it there is a short table in the assignment's wording:

- "Must include" (5 items) and "Expected behavior" (6 items; a compound item — in several rows:
  "an email with the ticket" and "a repeated registration" separately) → a test;
- general requirements 1–13 → where it is done: a test, a command or a document section (for 1–5,
  8–10 there is no test — a link to the code or a README section).

The detailed table stays below as it is. The cross-check is the `scripts/check-readme-tests.mjs`
script with a test, in `make check`: each test reference in the README exists — a file, a pytest
function after `::`, e2e by the file name, a test title in «…». Without the script the table drifts
from the tests at the first rename.

## Two clients

The requirements about two clients and their e2e:

| Requirement                                           | e2e with two contexts                              |
| ----------------------------------------------------- | -------------------------------------------------- |
| The arrived counter updates live                      | `organizer-sees-arrivals-live.spec.ts` — exists    |
| Works with two open clients (general, item 11)        | `registration-updates-open-pages.spec.ts` — exists |
| Two people for the last seat: the seat goes to one    | none — a new `two-participants-last-seat.spec.ts`  |
| A ticket passes check-in once (two entrances at once) | check in the research; none — a new test           |

The new e2e does not prove simultaneity at the database level: two browsers send requests almost at
the same time, but the order is not guaranteed. The race is proven by pytest with threads
(`registrations/tests/test_concurrency.py`); e2e — that each client sees its own correct outcome
(one — "seat confirmed", the other — "waitlist, #1"), and the panel — 1 and 1. Say exactly that in
the README.

## README

- "State" — what works, what does not work, what was not done and why (general, item 12).
- "What it was built with" — Claude Code; the models — Opus 5.5 (the main one, 242 commits) and
  Sonnet 5.5 (54 commits) by the `Co-Authored-By` trailers; why — a couple of sentences, the human
  approves the text.
- "Course of work" — the decision log with the time, `make worktime` (the sum over sessions), the
  commit history, PRs by stage.
- "What's next" — add the push server (Centrifugo) from the decision of 2026-10-31 21:04.
- "What was borrowed" — the skills from `vuejs-ai/skills` and `affaan-m/ecc` (`skills-lock.json`),
  `feature-workflow` — an adaptation from `rbikbov/frontend-starter`, the shadcn-vue components (a
  generator), the rest — by the results of the research (the `create-vue`, `startproject`
  skeletons).

## Session export

The built-in `/export` exports only the current session, and running it on an old session
(`--resume`) would append new lines to it. Hence `scripts/export-sessions.mjs`
(`make export-sessions`): for each `.jsonl` of the project — a text file in a format close to
`/export` (the human's messages, the agent's answers, tool calls in brief), without what the
environment adds to a request; the sources are only read. The name is
`YYYY-MM-DD-HHMM-<working time>.txt`: the session start and the sum of the pauses between messages,
each capped at 15 minutes (the time is approximate). A repeated run extends the folder and replaces
the previous export of the same session. The files go to `docs/session/`, in a separate last
commit: the human can revert it.

## Junk check

`anti-slop-review` over the whole repository (code, `docs/`, README, `AGENTS.md`). The report goes
to the human in full; the fixes by their decisions — in separate commits.

## Assumptions and open questions

- General requirements 1–5, 8–10 are proven not by a test but by the code and the run command: a
  test for "a backend in Python" would exist only for the table.
- The cross-check script is Node, like `scripts/pre-push.mjs`: no new dependencies.
- The export file names — as above; if they need to be different, say so before the export.

## Acceptance scenarios

| Scenario                                                                                                                                            | Test level         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Given an event with 1 seat, two browsers on its page When both register Then one is confirmed, the other is #1 on the waitlist, the panel — 1 and 1 | e2e                |
| Given a reference to a nonexistent test in the README When `make check` Then the check fails with its name                                          | a script test      |
| Given the README When the reviewer reads it Then each item of the assignment has a test or a place in the repository                                | the human's review |
| Given `make stack-check` and `make stack-e2e` When the phase is closed Then both are green                                                          | a command          |
