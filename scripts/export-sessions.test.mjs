import assert from "node:assert/strict";
import { test } from "node:test";

import { claudeProjectDir, exportSession } from "./export-sessions.mjs";

const at = (minute) => `2026-11-04T17:${String(minute).padStart(2, "0")}:00.000Z`;
const user = (minute, content, extra = {}) => ({
  type: "user",
  timestamp: at(minute),
  message: { content },
  ...extra,
});
const assistant = (minute, content) => ({
  type: "assistant",
  timestamp: at(minute),
  message: { content },
});

test("names the file by the local start time and the time worked in the session", () => {
  const records = [
    user(1, "<command-name>/clear</command-name>\n<command-args></command-args>"),
    user(2, "Делаем фазу 7"),
    assistant(49, [{ type: "text", text: "Готово." }]),
  ];
  assert.equal(exportSession(records, "Europe/Kyiv").name, "2026-11-04-1901-16m.txt");
});

// A pause counts up to 15 minutes: the session may stay open overnight.
test("a pause between messages counts up to 15 minutes", () => {
  const records = [
    user(0, "старт"),
    assistant(10, [{ type: "text", text: "через 10 минут" }]),
    user(55, "через 45 минут — засчитано 15"),
    assistant(59, [{ type: "text", text: "через 4 минуты" }]),
  ];
  assert.equal(exportSession(records, "UTC").name, "2026-11-04-1700-29m.txt");
});

test("time worked over an hour shows hours and minutes", () => {
  const records = Array.from({ length: 10 }, (_, i) => ({
    ...user(0, `шаг ${i}`),
    timestamp: new Date(Date.parse(at(0)) + i * 14 * 60000).toISOString(),
  }));
  assert.equal(exportSession(records, "UTC").name, "2026-11-04-1700-2h06m.txt");
});

test("writes prompts, answers, tool calls and the head of their output", () => {
  const output = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join("\n");
  const records = [
    user(1, "покажи статус"),
    assistant(2, [
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: "Смотрю." },
      { type: "tool_use", name: "Bash", input: { command: "git status\ngit log" } },
    ]),
    user(3, [{ type: "tool_result", content: output }]),
  ];
  assert.equal(
    exportSession(records, "UTC").text,
    [
      "> покажи статус\n",
      "⏺ Смотрю.\n",
      "⏺ Bash(git status)",
      "  ⎿  line 1\n     line 2\n     line 3\n     line 4\n     line 5\n     line 6\n     … +2 lines\n",
    ].join("\n"),
  );
});

test("leaves out subagents, meta records and reminders", () => {
  const records = [
    user(1, "вопрос"),
    user(2, "skill body", { isMeta: true }),
    user(3, "subagent prompt", { isSidechain: true }),
    user(4, "<system-reminder>x</system-reminder>"),
    user(5, "<task-notification><summary>Agent finished</summary></task-notification>"),
    { type: "attachment", timestamp: at(6) },
  ];
  assert.equal(exportSession(records, "UTC").text, "> вопрос\n");
});

test("a session without messages is not exported", () => {
  assert.equal(exportSession([{ type: "ai-title", aiTitle: "x" }], "UTC"), null);
});

test("finds the Claude Code folder of a project by its path", () => {
  assert.equal(
    claudeProjectDir("/home/raf/event-registration", "/home/raf"),
    "/home/raf/.claude/projects/-home-raf-event-registration",
  );
});

test("drops the blocks the environment adds to a prompt, with their contents", () => {
  const records = [
    user(1, "<ide_opened_file>The user opened the file x.md</ide_opened_file>разбей коммит на два"),
    user(2, "<bash-input>git status</bash-input><bash-stdout>clean</bash-stdout>"),
    user(3, "<ide_selection>selected text</ide_selection>"),
  ];
  // What the person typed after "!" stays, its output is the environment's.
  assert.equal(exportSession(records, "UTC").text, "> разбей коммит на два\n\n> ! git status\n");
});
