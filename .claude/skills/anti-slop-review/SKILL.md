---
name: anti-slop-review
description: >
  A check of code and documentation for "AI slop" before committing a large change, a review or the
  delivery of the repository: generator and template leftovers, dead and unfinished options, claims
  in the README, docs and comments not backed by the code, a promotional tone and emoji, extra
  abstractions, fragile error handling, personal data in logs. Use when asked to check the code or
  the repository "for junk", to prepare the project for delivery or a demo, to review code written
  with AI.
---

# Junk review

An adaptation of the `anti-slop-review` skill from the `rbikbov/frontend-starter` template to this
repository (Django + Vue).

Junk is not style but **claims without backing and code without a reason to exist**. Each finding is
backed by a fact: a line of code, a command output, the absence of a consumer. Matters of taste and
what the linter catches are out of scope.

Principles:

1. **Deleting is better than adding.** A dead option is deleted, not documented; a promotional
   phrase is replaced with a fact or deleted.
2. **A claim is checked against the code, not from memory.** Before calling a README line right or
   wrong — open the file it talks about or run the command.
3. **A finding without proof is not a finding.**
4. Edits — only on request. By default the result of the review is a list.

## Order

1. Determine the scope: a diff, files or the whole repository before the delivery. If a commit
   range is given (the `reviewer` agent does that) — the diff by it; otherwise
   `git diff <base>...HEAD`.
2. Run the search from the "Candidates" section — it gives candidates, not findings.
3. Check each candidate by reading the code, drop the false ones.
4. Go through the checklist — what the search does not catch: the README and docs against the code,
   UI states, abstractions.
5. If there is a browser — start the stack of your slot (the main session — `make stack-up`, slot 1:
   http://localhost:5174, Mailpit http://localhost:8026), look at the pages, then
   `make stack-down`. Do not run `make up`: it is the human's stack. Without a browser (the
   `reviewer` agent) — mark it under "not checked".
6. A report in the format below.

## Checklist

**Generator and template leftovers.** Starter pages and texts of generators, example files, tests
that check only the template's heading, empty `index.ts`, layer folders without code, `.gitkeep`
next to files.

**Dead and unfinished.** "not implemented" branches, a union of one value as an "extension point",
commented-out code, a `TODO` without a reason, unused exports and dependencies, make targets and
scripts that refer to something nonexistent.

**Documentation against the code** (`README.md`, `docs/`, `AGENTS.md`, comments, commit messages):

- names and paths: the mentioned files, commands, make targets, environment variables exist;
- behavior: "checked in CI", "the lock protects against the race", "exactly one email" — find the
  code and the test that do it;
- the future in the present tense: something planned described as done;
- the "requirement → test" tables in the README and `docs/requirements.md`: each test exists and
  checks what is claimed;
- links and anchors in markdown lead where they should.

**Tone.** Evaluative words instead of facts (modern, powerful, reliable, production-ready,
seamless, robust), emoji in documentation, UI, logs and commits, comments that retell the code,
history comments ("fixed", "updated to X"). The replacement is a fact: what it does, why it is so,
what the limitation is.

**Extra abstractions.** An interface or a factory with one implementation and without a fake in the
tests; a layer, a Django app, an FSD slice without a consumer; wrappers that only rename; parameters
that nobody passes.

**Errors and async.** The kind of an error by the message text; an empty `catch` / `except: pass`;
`except Exception` without a re-raise or meaningful handling; a server error text shown to the user
as is; no loading, error, empty states; a promise without `await`.

**Backend.** Business logic in a view instead of `services.py`; an invariant check only in Python
where a race is possible (a database constraint or a lock is needed); `datetime.now()` without a time
zone; an API change without an updated `openapi.yaml`; an edit of a committed migration.

**Security and privacy.** Emails, names, ticket codes, tokens in logs; secrets in the repository or
the history; `.env` in the index; a token in a URL that stays in the address bar or logs; user input
in HTML without escaping (`v-html`, `mark_safe`).

**Tests.** Tests check mocks, not behavior; a race test without real concurrency (sequential calls
instead of threads); e2e with `waitForTimeout`; a test that does not fail with broken behavior.

**Git.** Unrelated changes in one commit; a message that does not describe the diff; generated
files, except the deliberately committed ones (`openapi.yaml`, `schema.d.ts`).

## Candidates

The commands give candidates; each match is checked by reading the code. ripgrep (`rg`) is needed.

```bash
# Promotional tone and templates
rg -n -i "modern|powerful|reliable|premium|state-of-the-art|cutting-edge|blazing|seamless|robust|production-ready|enterprise-grade|get started by editing|welcome to" \
  --glob '!**/node_modules/**' --glob '!*.lock' --glob '!pnpm-lock.yaml'

# Emoji in code, UI and documentation
rg -n --pcre2 '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' --glob '!**/node_modules/**' --glob '!*.lock'

# Unfinished
rg -n -i "not implemented|todo|fixme|hack|xxx" --glob '!**/node_modules/**' --glob '!docs/task.md'

# Fragile errors
rg -n "except Exception|except:|pass$" backend --glob '!**/migrations/**'
rg -n "catch \{\s*\}|catch \(\w*\) \{\s*\}|\.catch\(\(\) => \{\s*\}\)|message ===|message\.includes" frontend/src e2e

# Personal data in logs
rg -n "(logger|logging|print|console)\.?\w*\(.*(email|name|code|token|password)" backend frontend/src

# Time without a time zone
rg -n "datetime\.now\(\)|datetime\.utcnow\(\)" backend

# Unsafe HTML
rg -n "v-html|mark_safe|\|safe" frontend/src backend

# Secrets in the history and .env in the index
git log -p --all | rg -n -i "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}"
git ls-files | rg -n "(^|/)\.env($|\.)" | rg -v "\.env\.example$"
```

## Report format

Findings in order of importance: security and privacy → false claims in the documentation → errors
of error handling and races → dead and unfinished → templates → tone.

```text
<file>:<line> — <category>
What: <one sentence with a fact>
Why it matters: <the consequence for the user, the reviewer or whoever will maintain it>
Fix: <specific; most often "delete" or "replace with a fact: …">
```

At the end: what was checked without findings and what was not checked (for example, the
application was not started). No findings — say so, without far-fetched remarks.
