# How it was built with AI

## Model and tool

Claude Code (CLI, WSL). Models — Claude Opus 5.5 (the main one: 261 commits with its
`Co-Authored-By` signature at the close of phase 7) and Claude Sonnet 5.5 (54 commits, almost all
on October 30). To recount: `git log --format='%(trailers:key=Co-Authored-By,valueonly)' | grep -ci opus`.

Claude Code is an agent in the terminal: it runs tests, git and Docker itself, and hooks, skills
and subagents build checks and an independent review right into the process. At first the plan
and the review were done with Opus and the implementation with Sonnet; but at my pace of work Opus
was more comfortable for the implementation too, and the subscription limit for it was enough for
everything — so from then on everything ran on Opus.

How we worked with the agent — [AGENTS.md](../AGENTS.md) (the rules the agent reads at the start of
each session), `.claude/skills/` (procedures: a phase from spec to review, session handoff, a check
for junk), `.claude/agents/reviewer.md` (an independent review of each stage with a clean context),
`.claude/hooks/` (formatting after an edit, a ban on `--no-verify` and force push). The decisions
made in discussions with the agent are in [docs/decisions.md](decisions.md) with the time; the spec
and tasks of each phase are in `docs/features/<phase>/`.

The raw exports of the 51 sessions of the development (October 28 – November 4; in Russian, as the
work went) were in `docs/session/` until they were removed on November 21; they stay in the history:
[docs/session at eaea3b9](https://github.com/rbikbov/event-registration/tree/eaea3b9/docs/session).
A file per Claude Code session, as text in a format close to `/export` (requests, answers, tool
calls and the start of their output; without the model's thinking and subagent conversations), made
by `make export-sessions`. The process itself reads better from the decision log, the phases'
specs and tasks and the review reports.

## Course of work

The work went from October 28 to November 4, 2026, in sessions. Each session is marked in
[docs/decisions.md](decisions.md) with the `▶ start` and `■ end` markers; `make worktime` sums them
(58 h 35 min at the close of phase 7). The markers were introduced on the evening of October 29,
earlier sessions are marked retroactively by commit times (such entries are labeled). The sum is
approximate: the markers were put by hand, not by the agent's sessions, and an end on November 3
has no start, so that session is not counted. Since November 21 the sessions are not marked. Phase stages
are separate branches and PRs since stage 3 of phase 1 (PR #1); since then each stage also gets an
independent review by the `reviewer` agent, since PR #7 in a separate copy of the repository and its
own stack. Commits are small steps, one per task.

## Skills and hooks

Procedures ("how to do X step by step") are skills in `.claude/skills/`: `session-handoff`,
`feature-workflow`, `fsd-frontend`, `anti-slop-review`, `api-change`; the independent review
agent is `.claude/agents/reviewer.md`. The source is the
[rbikbov/frontend-starter](https://github.com/rbikbov/frontend-starter) template, adapted to
Django + Vue. The templates of a phase's spec and tasks are in `docs/features/_template/`.

Third-party skills (`django-security`, `vue-best-practices`, `vue-router-best-practices`,
`vue-testing-best-practices`) are not in git and are optional: `make skills` installs them with
`npx skills@1.9.0 experimental_install` (the CLI pinned too) from `skills-lock.json`, which pins
each one to a commit of its source, into `.agents/skills/` with symlinks in `.claude/skills/` (both
git-ignored; it needs network). A clone made while they were in git loses them on update — run
`make skills` again. They are not edited: `npx skills update` moves them to newer versions and
rewrites the lock file. Project-specific additions go into `AGENTS.md` or our own skills. Without
them the agent still works by the project's rules (no rule refers to them); they add general Vue
and Django advice. On Windows the symlinks need developer mode — work from WSL.

### Claude Code hooks

Configured in `.claude/settings.json`, the scripts are in `.claude/hooks/` (Node, no
dependencies). They apply only to the agent and do not affect manual work.

| Event                      | Script                 | What it does                                                                                                                        |
| -------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`             | `session-start.mjs`    | shows the agent the phase "in progress", its open tasks from `tasks.md` (or a hint to start with the spec) and the latest commits   |
| `PreToolUse` (Bash)        | `guard-bash.mjs`       | blocks bypassing git hooks (`--no-verify`, `-n`, `HUSKY=0`, changing `core.hooksPath`), force push and `--amend` of a pushed commit |
| `PreToolUse` (Edit/Write)  | `guard-migrations.mjs` | blocks edits of committed migrations `backend/*/migrations/NNNN_*.py`                                                               |
| `PostToolUse` (Edit/Write) | `format-file.mjs`      | formats the changed file like `pre-commit` (Prettier, ruff, ESLint); shows the agent the remaining linter errors                    |

- `guard-bash.mjs` first cuts heredocs and quoted strings out of the command (otherwise `-n` in
  the text of a commit message would act as a flag), then checks each simple command (separators
  — newline, `;`, `|`, `&`) separately. A new case is a row in `guard-bash.test.mjs`.
- Hooks on Edit/Write do not see a file edited through the shell (`sed -i`, `>`). The rules still
  apply, but following them in that case is up to the agent and the review.
- Hooks are picked up when `.claude/settings.json` changes, without restarting the session. If a
  hook blocks too much, fix the script and add the case to the test instead of bypassing the hook.

## What was borrowed

- The structure of the agent rules (`AGENTS.md` + `CLAUDE.md`, rules that always apply), the
  `feature-workflow`, `fsd-frontend`, `anti-slop-review` skills and the `reviewer` agent — from my
  template [rbikbov/frontend-starter](https://github.com/rbikbov/frontend-starter), adapted to
  Django + Vue (`docs/decisions.md`, 2026-10-28, 21:25, 21:41 and 23:00). The hooks and the
  `session-handoff`, `api-change` skills were written in this project.
- The `vue-best-practices`, `vue-router-best-practices`, `vue-testing-best-practices` skills
  ([vuejs-ai/skills](https://github.com/vuejs-ai/skills)) and `django-security`
  ([affaan-m/ecc](https://github.com/affaan-m/ecc)) — whole, through `npx skills add`; optional, not in git
  ([Skills and hooks](#skills-and-hooks)).
- UI components — [shadcn-vue](https://www.shadcn-vue.com/), generated by its CLI into
  `frontend/src/shared/ui/shadcn/`.
- The Django and Vue skeletons were not created by generators (`startproject`, `create-vue`) — they
  were written by the agent.
