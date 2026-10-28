// PreToolUse hook for Edit/Write: blocks edits of committed Django migrations.
// A committed migration may already be applied elsewhere; fixes go into a new migration.
// Rules: docs/rules/db-migrations.md. Exit code 2 blocks the call and shows stderr to the agent.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

function isTracked(path) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (file) {
  const path = relative(root, file);
  if (/^backend\/[^/]+\/migrations\/\d{4}_[^/]+\.py$/.test(path) && isTracked(path)) {
    console.error(
      `Blocked: ${path} is committed and may already be applied. Create a new migration ` +
        "instead (docs/rules/db-migrations.md, rule 1).",
    );
    process.exit(2);
  }
}
