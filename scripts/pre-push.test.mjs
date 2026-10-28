import assert from "node:assert/strict";
import { test } from "node:test";

import { commandsFor } from "./pre-push.mjs";

test("docs-only changes run nothing", () => {
  assert.deepEqual(commandsFor(["docs/decisions.md", "README.md"]), []);
});

test("backend changes run backend checks", () => {
  assert.deepEqual(commandsFor(["backend/config/health.py"]), ["make dev-deps check-backend"]);
});

test("hook changes run tooling tests", () => {
  assert.deepEqual(commandsFor([".claude/hooks/guard-bash.mjs"]), ["pnpm test:tooling"]);
});

test("shared files run every part", () => {
  assert.deepEqual(commandsFor(["Makefile"]), ["make dev-deps check-backend", "pnpm test:tooling"]);
});
