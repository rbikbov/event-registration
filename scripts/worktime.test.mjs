import assert from "node:assert/strict";
import { test } from "node:test";

import { formatReport, parseSessions } from "./worktime.mjs";

const log = (body) => `# Лог решений\n\n${body}\n`;

test("sums the length of a session inside one day", () => {
  const { sessions, warnings } = parseSessions(
    log(
      "## 2026-10-28\n\n- **18:00** — ▶ начало сессии\n- **19:30** — решение\n- **20:15** — ■ конец сессии",
    ),
  );
  assert.deepEqual(sessions, [
    { start: "2026-10-28 18:00", end: "2026-10-28 20:15", minutes: 135 },
  ]);
  assert.deepEqual(warnings, []);
});

test("a session may continue past midnight into the next day heading", () => {
  const { sessions } = parseSessions(
    log(
      "## 2026-10-28\n\n- **23:00** — ▶ начало сессии\n\n## 2026-10-29\n\n- **01:15** — ■ конец сессии",
    ),
  );
  assert.equal(sessions[0].minutes, 135);
});

test("an approximate time (~) on a marker is accepted", () => {
  const { sessions } = parseSessions(
    log("## 2026-10-28\n\n- **~18:45** — ▶ начало сессии\n- **19:45** — ■ конец сессии"),
  );
  assert.equal(sessions[0].minutes, 60);
});

test("ignores ordinary entries and markers mentioned in the middle of text", () => {
  const { sessions, warnings } = parseSessions(
    log("## 2026-10-28\n\n- **18:00** — решение про ▶ и ■ в тексте"),
  );
  assert.deepEqual(sessions, []);
  assert.deepEqual(warnings, []);
});

test("an unclosed session is a warning and is not counted", () => {
  const { sessions, warnings } = parseSessions(
    log("## 2026-10-28\n\n- **18:00** — ▶ начало сессии"),
  );
  assert.deepEqual(sessions, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2026-10-28 18:00/);
});

test("a start while another session is open and an end without a start are warnings", () => {
  const { sessions, warnings } = parseSessions(
    log(
      "## 2026-10-28\n\n- **08:00** — ■ конец сессии\n- **09:00** — ▶ начало сессии\n- **10:00** — ▶ начало сессии\n- **11:00** — ■ конец сессии",
    ),
  );
  assert.deepEqual(sessions, [{ start: "2026-10-28 10:00", end: "2026-10-28 11:00", minutes: 60 }]);
  assert.equal(warnings.length, 2);
});

test("an end before its start is a warning, not negative time", () => {
  const { sessions, warnings } = parseSessions(
    log("## 2026-10-28\n\n- **10:00** — ▶ начало сессии\n- **09:00** — ■ конец сессии"),
  );
  assert.deepEqual(sessions, []);
  assert.equal(warnings.length, 1);
});

test("a marker before any day heading is a warning", () => {
  const { sessions, warnings } = parseSessions(log("- **10:00** — ▶ начало сессии"));
  assert.deepEqual(sessions, []);
  assert.equal(warnings.length, 1);
});

test("report lists sessions, the total in hours and minutes, and warnings", () => {
  const report = formatReport({
    sessions: [
      { start: "2026-10-28 18:45", end: "2026-10-29 01:17", minutes: 392 },
      { start: "2026-10-29 10:00", end: "2026-10-29 10:20", minutes: 20 },
    ],
    warnings: ["something"],
  });
  assert.match(report, /2026-10-28 18:45 → 2026-10-29 01:17 {2}6 ч 32 мин/);
  assert.match(report, /Итого: 6 ч 52 мин/);
  assert.match(report, /Предупреждение: something/);
});
