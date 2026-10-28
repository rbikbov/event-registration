// git pre-push hook: runs the checks of the parts touched by the commits being pushed.
// Full checks of everything run in CI. Reads the refs being pushed from stdin, as git
// passes them: "<local ref> <local sha> <remote ref> <remote sha>" per line.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ZERO_SHA = /^0+$/;

// A change in any of these affects every part, so everything is checked.
const SHARED = [
  /^Makefile$/,
  /^docker-compose\.yml$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.prettierrc\.json$/,
];

const PARTS = [
  { name: "backend", match: /^backend\//, command: "make dev-deps check-backend" },
  { name: "frontend", match: /^frontend\//, command: "make check-frontend" },
  { name: "e2e", match: /^e2e\//, command: "make check-e2e" },
  {
    name: "Claude Code hooks and scripts",
    match: /^(\.claude\/hooks|scripts)\//,
    command: "pnpm test:tooling",
  },
];

export function commandsFor(files) {
  if (files.some((file) => SHARED.some((pattern) => pattern.test(file)))) {
    return PARTS.map((part) => part.command);
  }
  return PARTS.filter((part) => files.some((file) => part.match.test(file))).map(
    (part) => part.command,
  );
}

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function changedFiles(localSha, remoteSha) {
  // A new branch has no remote sha: compare with what any remote already has.
  // Nothing pushed yet at all: every tracked file counts as changed.
  const base = ZERO_SHA.test(remoteSha)
    ? git(`rev-list ${localSha} --not --remotes`).split("\n").filter(Boolean).at(-1)
    : remoteSha;
  if (!base) return [];
  const hasParent = git(`rev-list --parents -n 1 ${base}`).split(" ").length > 1;
  if (ZERO_SHA.test(remoteSha) && !hasParent)
    return git(`ls-tree -r --name-only ${localSha}`).split("\n");
  const from = ZERO_SHA.test(remoteSha) ? `${base}^` : base;
  return git(`diff --name-only ${from} ${localSha}`).split("\n").filter(Boolean);
}

function main() {
  const files = new Set();
  for (const line of readFileSync(0, "utf8").split("\n").filter(Boolean)) {
    const [, localSha, , remoteSha] = line.split(" ");
    if (ZERO_SHA.test(localSha)) continue; // branch deletion
    for (const file of changedFiles(localSha, remoteSha)) files.add(file);
  }

  const commands = commandsFor([...files]);
  if (commands.length === 0) {
    console.log("pre-push: no checked parts changed, nothing to run");
    return;
  }
  for (const command of commands) {
    console.log(`pre-push: ${command}`);
    execSync(command, { stdio: "inherit" });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch {
    console.error(
      "pre-push: checks failed, push aborted. Fix the problem; do not use --no-verify.",
    );
    process.exit(1);
  }
}
