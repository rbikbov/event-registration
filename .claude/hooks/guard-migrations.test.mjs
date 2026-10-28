import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../..");
const hook = join(import.meta.dirname, "guard-migrations.mjs");

function run(relativePath) {
  return spawnSync("node", [hook], {
    input: JSON.stringify({ tool_input: { file_path: join(root, relativePath) } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  }).status;
}

test("blocks a committed migration", () => {
  assert.equal(run("backend/accounts/migrations/0001_initial.py"), 2);
});

test("allows a new, uncommitted migration", () => {
  assert.equal(run("backend/accounts/migrations/0999_not_committed.py"), 0);
});

test("allows the migrations package marker", () => {
  assert.equal(run("backend/accounts/migrations/__init__.py"), 0);
});

test("allows ordinary backend code", () => {
  assert.equal(run("backend/accounts/models.py"), 0);
});
