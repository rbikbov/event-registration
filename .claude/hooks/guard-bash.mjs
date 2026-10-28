// PreToolUse hook for Bash: blocks commands that bypass git hooks or rewrite published
// history. Exit code 2 blocks the call and shows stderr to the agent.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));

// Heredoc bodies and quoted strings (commit messages, script text) are dropped so that
// their content is not mistaken for flags. Then each simple command is checked separately.
const segments = (input.tool_input?.command ?? "")
  .replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1(?=\n|$)/g, "")
  .replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""')
  .split(/[\n;|&]+/)
  .map((s) => s.trim());

function block(reason) {
  console.error(`Blocked: ${reason} See AGENTS.md, rule 2.`);
  process.exit(2);
}

function isPushed(ref) {
  try {
    return execSync(`git branch -r --contains ${ref}`, { encoding: "utf8" }).trim() !== "";
  } catch {
    return false;
  }
}

for (const segment of segments) {
  if (/(^|\s)HUSKY=0\b/.test(segment)) {
    block("disabling git hooks (HUSKY=0) is not allowed.");
  }
  if (!/\bgit\s/.test(segment)) continue;

  if (/core\.hooksPath(=|\s+\S)/.test(segment)) {
    block("changing core.hooksPath disables git hooks.");
  }
  if (/\s--no-verify\b/.test(segment) || /\bcommit\b.*\s-[a-zA-Z]*n/.test(segment)) {
    block("skipping git hooks (--no-verify / -n) is not allowed. Fix the failing check instead.");
  }
  if (/\bpush\b.*(\s--force(-with-lease)?\b|\s-[a-zA-Z]*f)/.test(segment)) {
    block("force push is not allowed.");
  }
  if (/\bcommit\b.*\s--amend\b/.test(segment) && isPushed("HEAD")) {
    block("HEAD is already pushed; amending it rewrites published history. Make a new commit.");
  }
}
