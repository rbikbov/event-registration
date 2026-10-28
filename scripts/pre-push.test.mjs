import assert from "node:assert/strict";
import { test } from "node:test";

import { commandsFor } from "./pre-push.mjs";

test("docs-only changes run nothing", () => {
  assert.deepEqual(commandsFor(["docs/decisions.md", "README.md"]), []);
});

test("backend changes run backend checks", () => {
  assert.deepEqual(commandsFor(["backend/config/health.py"]), ["make dev-deps check-backend"]);
});

test("frontend changes run frontend checks", () => {
  assert.deepEqual(commandsFor(["frontend/src/app/App.vue"]), ["make check-frontend"]);
});

test("e2e changes run static checks of the e2e code", () => {
  assert.deepEqual(commandsFor(["e2e/tests/smoke.spec.ts"]), ["make check-e2e"]);
});

test("workflow changes run CI workflow checks", () => {
  assert.deepEqual(commandsFor([".github/workflows/ci.yml"]), ["make check-ci"]);
});

test("hook changes run tooling tests", () => {
  assert.deepEqual(commandsFor([".claude/hooks/guard-bash.mjs"]), ["make check-tooling"]);
});

test("shared files run every part", () => {
  assert.deepEqual(commandsFor(["Makefile"]), [
    "make dev-deps check-backend",
    "make check-frontend",
    "make check-e2e",
    "make check-ci",
    "make check-tooling",
  ]);
});
