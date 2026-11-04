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

test("names the file by the local start time and the first prompt, not a command", () => {
  const records = [
    user(1, "<command-name>/clear</command-name>\n<command-args></command-args>"),
    user(2, "Делаем фазу 7, этап 1"),
    assistant(3, [{ type: "text", text: "Начинаю." }]),
  ];
  const { name } = exportSession(records, "Europe/Kyiv");
  assert.equal(name, "2026-11-04-1901-делаем-фазу-7-этап-1.txt");
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
    { type: "attachment", timestamp: at(5) },
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
