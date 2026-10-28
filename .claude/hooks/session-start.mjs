// SessionStart hook: prints the phase in progress from docs/roadmap.md, the open tasks of
// that phase and recent commits, so a fresh session (including after /clear) knows where
// the work stopped and what to do next.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// readFile(relativePath) returns the file text or null if there is no such file.
export function summarize(roadmap, readFile) {
  const phases = roadmap.split(/^(?=## )/m).filter((s) => s.startsWith("## "));
  const active = phases.filter((s) => s.split("\n")[0].includes("в работе"));
  if (active.length === 0) return "No phase is in progress (docs/roadmap.md).";

  const parts = [];
  for (const phase of active) {
    parts.push(phase.trim());
    // A large phase keeps its spec and tasks in docs/features/<slug>/.
    const slug = phase.match(/docs\/features\/([\w-]+)\//)?.[1];
    if (!slug) continue;
    const tasks = readFile(`docs/features/${slug}/tasks.md`);
    if (tasks === null) {
      parts.push(
        `Next step: docs/features/${slug}/ does not exist yet — start with the ` +
          "feature-workflow skill: write spec.md and tasks.md from the templates and get them " +
          "approved by the human before any code.",
      );
      continue;
    }
    const open = tasks.split("\n").filter((line) => /^\s*- \[ \]/.test(line));
    parts.push(
      open.length > 0
        ? `Open tasks in docs/features/${slug}/tasks.md:\n${open.join("\n")}`
        : `All tasks in docs/features/${slug}/tasks.md are done — close the phase (session-handoff skill).`,
    );
  }
  return parts.join("\n\n");
}

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const readFile = (path) => {
    const full = join(root, path);
    return existsSync(full) ? readFileSync(full, "utf8") : null;
  };
  console.log("# Current state\n");
  console.log(summarize(readFile("docs/roadmap.md") ?? "", readFile));
  const log = execSync("git log --oneline -5", { cwd: root, encoding: "utf8" });
  console.log(`\n# Recent commits\n\n${log.trim()}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
