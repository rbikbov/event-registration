// PostToolUse hook for Edit/Write: formats the changed file, so the agent works with
// the same formatting that pre-commit would produce. Exit code 2 reports errors to the agent.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const PRETTIER_EXTENSIONS = new Set([".mjs", ".md", ".json", ".yml", ".yaml"]);

if (file && PRETTIER_EXTENSIONS.has(extname(file))) {
  // Prettier skips files listed in .prettierignore even when they are passed explicitly.
  const prettier = join(root, "node_modules/.bin/prettier");
  const result = spawnSync(prettier, ["--write", "--log-level", "warn", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`prettier failed on ${file}:\n${result.stderr}`);
    process.exit(2);
  }
}
