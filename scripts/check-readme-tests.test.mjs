import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { brokenTestRefs, repoFiles } from "./check-readme-tests.mjs";

const FILES = {
  "backend/accounts/tests/test_auth_api.py":
    "def test_login_ok(client):\n    pass\n\n\ndef test_login_bad(client):\n    pass\n",
  "backend/registrations/tests/test_ticket.py": "def test_ticket_api_shows_code():\n    pass\n",
  "frontend/src/app/router.test.ts": 'it("an address no route matches", () => {});\n',
  "e2e/tests/organizer-creates-event.spec.ts":
    'test("a wrong password keeps the form open", async () => {});\n',
  "docs/features/x/tasks.md": "# Tasks\n\n## Лог\n",
};

const fs = {
  files: Object.keys(FILES),
  read: (path) => FILES[path],
};

function readme(cell) {
  return [
    "# Project",
    "",
    "## Требования и тесты",
    "",
    "| Требование | Тест |",
    "| ---------- | ---- |",
    `| Something  | ${cell} |`,
    "",
    "## Что дальше",
    "",
    "| Not | `missing.py::test_nothing` |",
  ].join("\n");
}

test("accepts existing files, functions, globs and titles", () => {
  const cell = [
    "`accounts/tests/test_auth_api.py::test_login_ok`, `::test_login_bad`;",
    "`test_ticket.py` (`test_ticket_api_*`);",
    "`app/router.test.ts` («an address no route matches»);",
    "e2e `organizer-creates-event.spec.ts` («a wrong password …»);",
    "`docs/features/x/tasks.md`, «Лог»",
  ].join(" ");
  assert.deepEqual(brokenTestRefs(readme(cell), fs), []);
});

test("reports a missing file", () => {
  assert.deepEqual(brokenTestRefs(readme("`test_gone.py::test_x`"), fs), [
    "Something: `test_gone.py` — no such file",
  ]);
});

test("reports a missing function and resolves `::` against the previous file", () => {
  const cell = "`accounts/tests/test_auth_api.py::test_login_ok`, `::test_renamed`";
  assert.deepEqual(brokenTestRefs(readme(cell), fs), [
    "Something: `::test_renamed` — not in backend/accounts/tests/test_auth_api.py",
  ]);
});

test("reports a glob that matches no function", () => {
  assert.deepEqual(brokenTestRefs(readme("`test_ticket.py` (`test_email_*`)"), fs), [
    "Something: `test_email_*` — not in backend/registrations/tests/test_ticket.py",
  ]);
});

test("reports a title that is not in the file before it", () => {
  const cell = "`app/router.test.ts` («a renamed test …»)";
  assert.deepEqual(brokenTestRefs(readme(cell), fs), [
    "Something: «a renamed test …» — not in frontend/src/app/router.test.ts",
  ]);
});

test("reports a title with no file before it", () => {
  assert.deepEqual(brokenTestRefs(readme("«an address no route matches»"), fs), [
    "Something: «an address no route matches» — no file before it",
  ]);
});

test("reports a bare file name that matches several files", () => {
  const twin = {
    files: [...fs.files, "backend/emails/tests/test_ticket.py"],
    read: fs.read,
  };
  assert.deepEqual(brokenTestRefs(readme("`test_ticket.py`"), twin), [
    "Something: `test_ticket.py` — several files: backend/registrations/tests/test_ticket.py, backend/emails/tests/test_ticket.py",
  ]);
});

test("prefers a file at a root to files of the same name deeper", () => {
  const nested = {
    files: [...fs.files, "AGENTS.md", "backend/AGENTS.md"],
    read: fs.read,
  };
  assert.deepEqual(brokenTestRefs(readme("`AGENTS.md`"), nested), []);
});

test("ignores code that is not a file reference", () => {
  assert.deepEqual(brokenTestRefs(readme("`make seed`, `confirmed`"), fs), []);
});

test("fails when the section is missing", () => {
  assert.deepEqual(brokenTestRefs("# Project\n", fs), [
    "README has no «## Требования и тесты» table",
  ]);
});

// A worktree of the reviewer in an ignored folder holds a copy of every test: its files must
// not make a bare file name ambiguous. A new test not yet added to git still counts.
test("repo files are those git sees: ignored folders and deleted files are left out", () => {
  const repo = mkdtempSync(join(tmpdir(), "check-readme-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    const write = (path, text = "") => {
      mkdirSync(join(repo, path, ".."), { recursive: true });
      writeFileSync(join(repo, path), text);
    };
    git("init", "-q");
    write(".gitignore", ".claude/worktrees/\n");
    write("backend/tests/test_kept.py");
    write("backend/tests/test_deleted.py");
    git("add", ".");
    rmSync(join(repo, "backend/tests/test_deleted.py"));
    write("backend/tests/test_new.py");
    write(".claude/worktrees/review/backend/tests/test_kept.py");

    assert.deepEqual(repoFiles(repo).sort(), [
      ".gitignore",
      "backend/tests/test_kept.py",
      "backend/tests/test_new.py",
    ]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
