import assert from "node:assert/strict";
import { test } from "node:test";

import { actionRefs } from "./check-action-refs.mjs";

test("extracts remote actions with repo and ref", () => {
  const workflow = `
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10.3.3 # comment
        with:
          version: "0.13.6"
`;
  assert.deepEqual(actionRefs(workflow), [
    { uses: "actions/checkout@v7", repo: "actions/checkout", ref: "v7" },
    { uses: "astral-sh/setup-uv@v10.3.3", repo: "astral-sh/setup-uv", ref: "v10.3.3" },
  ]);
});

test("uses the repository part of an action in a subdirectory", () => {
  assert.deepEqual(actionRefs("- uses: github/codeql-action/init@v4"), [
    { uses: "github/codeql-action/init@v4", repo: "github/codeql-action", ref: "v4" },
  ]);
});

test("skips local and docker actions", () => {
  assert.deepEqual(actionRefs("- uses: ./.github/actions/x\n- uses: docker://alpine:3"), []);
});
