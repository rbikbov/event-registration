// Sums working time from the session markers in docs/decisions.md:
//   - **18:45** — ▶ session start
//   - **01:17** — ■ session end
// The date comes from the nearest `## YYYY-MM-DD` heading above the marker, so a session may
// cross midnight. Wall-clock time is used as is: a DST change inside a session is not corrected.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DECISIONS = "docs/decisions.md";
const HEADING = /^## (\d{4})-(\d{2})-(\d{2})\s*$/;
const MARKER = /^- \*\*~?(\d{2}):(\d{2})\*\* — ([▶■])/;

const stamp = (day, hh, mm) => `${day} ${hh}:${mm}`;
const toMinutes = (day, hh, mm) => Date.parse(`${day}T${hh}:${mm}:00Z`) / 60000;

// Returns closed sessions and warnings about markers that do not pair up.
export function parseSessions(text) {
  const sessions = [];
  const warnings = [];
  let day = null;
  let open = null;

  for (const line of text.split("\n")) {
    const heading = line.match(HEADING);
    if (heading) {
      day = `${heading[1]}-${heading[2]}-${heading[3]}`;
      continue;
    }
    const marker = line.match(MARKER);
    if (!marker) continue;
    const [, hh, mm, symbol] = marker;
    if (day === null) {
      warnings.push(`marker ${symbol} ${hh}:${mm} comes before the first day heading`);
      continue;
    }
    const at = stamp(day, hh, mm);

    if (symbol === "▶") {
      if (open) warnings.push(`start ${at}: the previous session (${open.at}) is not closed`);
      open = { at, minutes: toMinutes(day, hh, mm) };
    } else if (!open) {
      warnings.push(`end ${at}: no session start`);
    } else {
      const minutes = toMinutes(day, hh, mm) - open.minutes;
      if (minutes < 0) {
        warnings.push(`end ${at} is earlier than start ${open.at}`);
      } else {
        sessions.push({ start: open.at, end: at, minutes });
      }
      open = null;
    }
  }
  if (open) warnings.push(`the session from ${open.at} is not closed and not counted`);
  return { sessions, warnings };
}

const duration = (minutes) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

export function formatReport({ sessions, warnings }) {
  const lines = sessions.map((s) => `${s.start} → ${s.end}  ${duration(s.minutes)}`);
  const total = sessions.reduce((sum, s) => sum + s.minutes, 0);
  lines.push(`Total: ${duration(total)}`);
  for (const warning of warnings) lines.push(`Warning: ${warning}`);
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(formatReport(parseSessions(readFileSync(DECISIONS, "utf8"))));
}
