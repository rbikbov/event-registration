import assert from "node:assert/strict";
import { test } from "node:test";

import { commandsFor } from "./pre-push.mjs";

test("docs-only changes run nothing", () => {
  assert.deepEqual(commandsFor(["docs/decisions.md", "docs/roadmap.md"]), []);
});

test("README changes check its test references", () => {
  assert.deepEqual(commandsFor(["README.md"]), ["make check-readme"]);
});

test("backend changes run backend checks", () => {
  assert.deepEqual(commandsFor(["backend/config/health.py"]), [
    "make dev-deps check-backend",
    "make check-readme",
  ]);
});

test("backend changes pushed from a slot use the slot's Postgres", () => {
  assert.deepEqual(commandsFor(["backend/config/health.py"], "1"), [
    "make stack-check-backend SLOT=1",
    "make check-readme",
  ]);
});

test("shared files pushed from a slot check the backend on the slot's Postgres", () => {
  assert.equal(commandsFor(["Makefile"], "1")[0], "make stack-check-backend SLOT=1");
});

test("frontend changes run frontend checks", () => {
  assert.deepEqual(commandsFor(["frontend/src/app/App.vue"]), [
    "make check-frontend",
    "make check-readme",
  ]);
});

test("e2e changes run static checks of the e2e code", () => {
  assert.deepEqual(commandsFor(["e2e/tests/smoke.spec.ts"]), [
    "make check-e2e",
    "make check-readme",
  ]);
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
    "make check-readme",
  ]);
});
