// SessionStart hook: prints the current phase from docs/roadmap.md and recent commits,
// so a fresh session (including after /clear) knows where the work stopped.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
const phases = roadmap.split(/^(?=## )/m).filter((s) => s.startsWith("## "));
const active = phases.filter((s) => s.split("\n")[0].includes("в работе"));

console.log("# Current state (docs/roadmap.md)\n");
console.log(active.length > 0 ? active.join("\n").trim() : "No phase is in progress.");

const log = execSync("git log --oneline -5", { cwd: root, encoding: "utf8" });
console.log(`\n# Recent commits\n\n${log.trim()}`);
