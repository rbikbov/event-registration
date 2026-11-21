# Delivery: tasks

Spec — `spec.md`. One task — one commit; the `[x]` check goes into the same commit.

## Stage 1. Requirements and tests

- [x] 1.1. Tracer bullet: `scripts/check-readme-tests.mjs` with a test and a target in
      `make check` — each test reference in the README table exists (a file, a function after
      `::`, an e2e file, a title in «…»). Done when: the script test — an existing reference
      passes, a nonexistent one fails with its name; `make stack-check` is green on the current
      README.
- [x] 1.2. E2E `two-participants-last-seat.spec.ts`: an event with 1 seat, two contexts on its
      page, registration in both almost at the same time — one has "seat confirmed", the other
      "waitlist, #1", the panel — 1 and 1. Done when: passes in `make stack-e2e` and fails if both
      see "confirmed".
- [x] 1.3. A check-in of one code at two entrances — an e2e with two contexts, if the research did
      not find one. Done when: one entrance — "checked in", the other — "already checked in at …".
- [x] 1.4. README: the "requirement of the assignment → test" table (the "Must include" and
      "Expected behavior" items) and "general requirements → where it is done" above the detailed
      table. Done when: each item of `docs/task.md` has a row; `make stack-check` is green.

## Stage 2. README and delivery

- [x] 2.1. README: "What it was built with", "Course of work", "What was borrowed", "What's next"
      (the push server), "State" — what works, what does not, what was not done and why. Done when:
      each statement is backed by code, a command or a link; the text "why this model" is approved
      by the human.
- [x] 2.2. `anti-slop-review` over the whole repository; the report goes to the human. The fixes by
      their decisions — in separate commits. Done when: the decisions on each finding are carried
      out.
- [x] 2.3. The session export with the `make export-sessions` script into `docs/session/` (the last
      separate commit). Done when: a file per session, the names sort by time; the human has looked
      through them.
- [x] 2.4. Closing phase 7: the criteria by facts, the roadmap — "done", `make stack-check` and
      `make stack-e2e` are green.

## Log

- The base of stage 1 — `0096133`.
- 1.4: the links to the README section "What it was built with" from the table of general
  requirements will work with task 2.1.
- The base of stage 2 — `ce4a889`.

## Later
