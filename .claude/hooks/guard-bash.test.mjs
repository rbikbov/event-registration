import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const hook = join(import.meta.dirname, "guard-bash.mjs");

function run(command) {
  return spawnSync("node", [hook], { input: JSON.stringify({ tool_input: { command } }) }).status;
}

const allowed = [
  'git commit -m "feat: x"',
  'git commit -am "fix: y"',
  'git commit -m "fix: handle -n and --no-verify in text"',
  "git commit -m 'docs: mention --force'",
  "git commit -q -m \"$(cat <<'EOF'\nfeat: x\n\nmention -n and --no-verify\nEOF\n)\"",
  "git config core.hooksPath",
  "git push origin main",
  "ls -n | grep x",
  "git commit -m x\nls -n",
  "cat > f.py <<'EOF'\ns = '''x'''\ngit commit -n\nEOF\necho ok",
];

const blocked = [
  "git commit --no-verify -m x",
  'git commit -nm "x"',
  "git add . && git commit -n -m x",
  "HUSKY=0 git commit -m x",
  "git -c core.hooksPath=/dev/null commit -m x",
  "git push --force origin main",
  "git push -f",
  "git push --force-with-lease",
];

for (const command of allowed) {
  test(`allows ${JSON.stringify(command)}`, () => assert.equal(run(command), 0));
}

for (const command of blocked) {
  test(`blocks ${JSON.stringify(command)}`, () => assert.equal(run(command), 2));
}
