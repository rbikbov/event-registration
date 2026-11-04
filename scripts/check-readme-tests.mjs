// Checks that every test the README «Требования и тесты» tables point to exists: the file, the
// pytest function after `::`, a `test_x_*` glob and a test title in «…». Without it the table
// drifts from the tests at the first rename.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const SECTION = "## Требования и тесты";
// Relative paths in the table are from these roots (README says so above the table).
const ROOTS = ["", "backend/", "frontend/src/", "e2e/tests/"];
const FILE_REF = /^([\w./-]+\.(?:py|ts|mjs|md|vue))(?:::(\w+))?$/;
const FUNCTION_REF = /^::(\w+)$/;
const GLOB_REF = /^(test_\w*)\*$/;
const TOKEN = /`([^`]+)`|«([^»]+)»/g;

function sectionRows(readme) {
  const start = readme.indexOf(`\n${SECTION}\n`);
  if (start === -1) return null;
  const rest = readme.slice(start + SECTION.length + 2);
  const end = rest.search(/^## /m);
  const lines = (end === -1 ? rest : rest.slice(0, end)).split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    if (/^\|\s*-/.test(lines[i]) || /^\|\s*-/.test(lines[i + 1] ?? "")) continue; // header
    const cells = lines[i].split("|").slice(1, -1);
    rows.push({ label: cells[0].trim(), refs: cells.slice(1).join("|") });
  }
  return rows;
}

function resolve(ref, files) {
  const path = ROOTS.map((root) => root + ref).find((p) => files.includes(p));
  if (path) return { path };
  if (ref.includes("/")) return { error: "no such file" };
  const matches = files.filter((f) => basename(f) === ref);
  if (matches.length === 0) return { error: "no such file" };
  if (matches.length > 1) return { error: `several files: ${matches.join(", ")}` };
  return { path: matches[0] };
}

const hasFunction = (text, name) => new RegExp(`^\\s*(?:async )?def ${name}\\(`, "m").test(text);
const hasGlob = (text, prefix) =>
  new RegExp(`^\\s*(?:async )?def ${prefix}\\w*\\(`, "m").test(text);
// «a title …» — the part before the ellipsis is a substring of the title in the file.
const hasTitle = (text, title) => text.includes(title.split("…")[0].trim());

// fs: { files: repo-relative paths, read(path) → text }. Returns messages, empty when all exist.
export function brokenTestRefs(readme, fs) {
  const rows = sectionRows(readme);
  if (!rows) return [`README has no «${SECTION}» table`];
  const broken = [];
  for (const { label, refs } of rows) {
    let file = null; // the last file referenced in this row
    for (const [, code, title] of refs.matchAll(TOKEN)) {
      const report = (shown, reason) => broken.push(`${label}: ${shown} — ${reason}`);
      if (title !== undefined) {
        if (!file) report(`«${title}»`, "no file before it");
        else if (!hasTitle(fs.read(file), title)) report(`«${title}»`, `not in ${file}`);
        continue;
      }
      const fileRef = code.match(FILE_REF);
      if (fileRef) {
        const found = resolve(fileRef[1], fs.files);
        file = found.path ?? null;
        if (found.error) report(`\`${fileRef[1]}\``, found.error);
        else if (fileRef[2] && !hasFunction(fs.read(file), fileRef[2]))
          report(`\`${code}\``, `not in ${file}`);
        continue;
      }
      const fn = code.match(FUNCTION_REF) ?? code.match(GLOB_REF);
      if (!fn) continue; // code that is not a reference: a command, a status
      if (!file) report(`\`${code}\``, "no file before it");
      else if (!(code.startsWith("::") ? hasFunction : hasGlob)(fs.read(file), fn[1]))
        report(`\`${code}\``, `not in ${file}`);
    }
  }
  return broken;
}

// The files git sees: tracked and new ones, not ignored. A walk of the disk would also find the
// copies in ignored folders (the reviewer's worktree in .claude/worktrees/) and call every bare
// file name ambiguous. A tracked file deleted but not yet committed is left out.
export function repoFiles(cwd = ".") {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd, encoding: "utf8" },
  );
  const files = output.split("\0").filter((file) => file && existsSync(join(cwd, file)));
  return [...new Set(files)];
}

function main() {
  const fs = { files: repoFiles(), read: (path) => readFileSync(path, "utf8") };
  const broken = brokenTestRefs(readFileSync("README.md", "utf8"), fs);
  if (broken.length > 0) {
    console.error(`README test references not found:\n  ${broken.join("\n  ")}`);
    process.exit(1);
  }
  console.log("All README test references exist");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
