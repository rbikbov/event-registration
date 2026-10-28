// PostToolUse hook for Edit/Write: formats the changed file and runs the linter on it, so
// the agent works with what pre-commit would produce and sees lint errors right away.
// Exit code 2 reports errors to the agent.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const PRETTIER_EXTENSIONS = new Set([".mjs", ".md", ".json", ".yml", ".yaml"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!file) process.exit(0);

if (PRETTIER_EXTENSIONS.has(extname(file))) {
  // Prettier skips files listed in .prettierignore even when they are passed explicitly.
  const prettier = run(join(root, "node_modules/.bin/prettier"), [
    "--write",
    "--log-level",
    "warn",
    file,
  ]);
  if (!prettier.ok) fail(`prettier failed on ${file}:\n${prettier.output}`);
}

// Node packages with their own eslint.config.js; ESLint runs from the package directory.
const ESLINT_PACKAGES = ["frontend", "e2e"];
const ESLINT_EXTENSIONS = new Set([".ts", ".vue", ".js"]);
const eslintPackage = ESLINT_PACKAGES.find((pkg) => relative(root, file).startsWith(`${pkg}/`));

if (eslintPackage && ESLINT_EXTENSIONS.has(extname(file))) {
  const prettier = run(join(root, "node_modules/.bin/prettier"), [
    "--write",
    "--log-level",
    "warn",
    file,
  ]);
  if (!prettier.ok) fail(`prettier failed on ${file}:\n${prettier.output}`);
  const eslint = spawnSync(join(root, eslintPackage, "node_modules/.bin/eslint"), ["--fix", file], {
    cwd: join(root, eslintPackage),
    encoding: "utf8",
  });
  if (eslint.status !== 0)
    fail(`eslint found problems in ${file}:\n${eslint.stdout}${eslint.stderr}`);
}

if (extname(file) === ".py" && relative(root, file).startsWith("backend/")) {
  const ruff = ["run", "--project", "backend", "ruff"];
  run("uv", [...ruff, "format", "--quiet", file]);
  const lint = run("uv", [...ruff, "check", "--fix", "--quiet", file]);
  if (!lint.ok) fail(`ruff found problems in ${file}:\n${lint.output}`);
}
