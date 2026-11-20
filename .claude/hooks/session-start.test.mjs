import assert from "node:assert/strict";
import { test } from "node:test";

import { summarize } from "./session-start.mjs";

const roadmap = `# Roadmap

## Phase 0. Skeleton — done

- [x] done

## Phase 1. Registration — in progress

Spec and tasks — \`docs/features/registration/\`.

## Phase 3. Check-in — not started
`;

test("shows only the phase in progress", () => {
  const out = summarize(roadmap, () => null);

  assert.match(out, /Phase 1/);
  assert.doesNotMatch(out, /Phase 0|Phase 3/);
});

test("points to feature-workflow when the phase has no spec yet", () => {
  assert.match(
    summarize(roadmap, () => null),
    /feature-workflow/,
  );
});

test("lists open tasks of a large phase", () => {
  const tasks = "- [x] 1. Tracer bullet\n- [ ] 2. Waitlist\n- [ ] 3. Cancel\n";
  const out = summarize(roadmap, (path) =>
    path === "docs/features/registration/tasks.md" ? tasks : null,
  );

  assert.match(out, /- \[ \] 2\. Waitlist\n- \[ \] 3\. Cancel/);
  assert.doesNotMatch(out, /Tracer bullet/);
});

test("says to close the phase when all its tasks are done", () => {
  const out = summarize(roadmap, () => "- [x] 1. Tracer bullet\n");

  assert.match(out, /close the phase/);
});

test("reports when no phase is in progress", () => {
  assert.match(
    summarize("## Phase 0. Skeleton — done\n", () => null),
    /No phase/,
  );
});
