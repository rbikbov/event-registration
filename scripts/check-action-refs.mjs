// Checks that every `uses: owner/repo@ref` in .github/workflows points to an existing tag or
// branch. actionlint does not check this: `astral-sh/setup-uv@v10` passed it, and CI failed
// at job setup because the project publishes no major tags.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const WORKFLOWS = ".github/workflows";
const FULL_SHA = /^[0-9a-f]{40}$/;

// Returns remote action references; local (./path) and docker:// actions are skipped.
export function actionRefs(workflowText) {
  const refs = [];
  for (const match of workflowText.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
    const uses = match[1];
    if (uses.startsWith("./") || uses.startsWith("docker://")) continue;
    const [path, ref] = uses.split("@");
    if (!path || !ref) continue;
    const [owner, repo] = path.split("/");
    refs.push({ uses, repo: `${owner}/${repo}`, ref });
  }
  return refs;
}

function refExists(repo, ref) {
  if (FULL_SHA.test(ref)) return true; // a pinned commit; ls-remote cannot look it up
  const output = execFileSync(
    "git",
    ["ls-remote", "--tags", "--heads", `https://github.com/${repo}.git`, ref],
    { encoding: "utf8" },
  );
  return output.trim() !== "";
}

function main() {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));
  const missing = [];
  for (const file of files) {
    for (const { uses, repo, ref } of actionRefs(readFileSync(join(WORKFLOWS, file), "utf8"))) {
      if (!refExists(repo, ref)) missing.push(`${file}: ${uses}`);
    }
  }
  if (missing.length > 0) {
    console.error(`Action refs not found (no such tag or branch):\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
  console.log("All action refs exist");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
