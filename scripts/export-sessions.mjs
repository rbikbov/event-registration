// Exports every Claude Code session of this project as text close to the built-in `/export`,
// which exports only the current session; resuming an old one to export it would append to it.
// Reads ~/.claude/projects/<project>/*.jsonl and never writes there. Subagent transcripts (in
// per-session folders), the model's thinking and what the environment adds to a prompt
// (background task notifications, IDE context, shell output) are left out. A file is named
// after the local time of the session's first message and the time worked in it, so running it
// again overwrites the files of finished sessions and adds the new ones.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RESULT_LINES = 6;
const RESULT_WIDTH = 200;
const MAX_PAUSE_MS = 15 * 60000;
const NOISE = ["<local-command-caveat>", "<local-command-stdout>", "<system-reminder>", "Caveat:"];
// Added by the environment, not typed by the person: dropped with their contents.
const ENVIRONMENT_BLOCKS =
  /<(task-notification|ide_opened_file|ide_selection|bash-stdout|bash-stderr)>[\s\S]*?<\/\1>/g;
const SUMMARY_KEYS = ["command", "file_path", "pattern", "description", "prompt", "query", "skill"];

// Claude Code keeps a project's sessions in a folder named after its path, every character
// other than a letter or a digit replaced with "-".
export function claudeProjectDir(projectPath, home = homedir()) {
  return join(home, ".claude", "projects", projectPath.replace(/[^A-Za-z0-9]/g, "-"));
}

function textOf(content) {
  if (typeof content === "string") return content;
  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_result") return textOf(block.content ?? "");
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function promptOf(text) {
  const command = /<command-name>(.*?)<\/command-name>/s.exec(text);
  if (!command) return text.trim();
  const args = /<command-args>(.*?)<\/command-args>/s.exec(text);
  return `${command[1].trim()} ${args ? args[1].trim() : ""}`.trim();
}

function toolSummary({ name = "?", input = {} }) {
  const key = SUMMARY_KEYS.find((k) => k in input);
  const value = key ? String(input[key] ?? "").split("\n")[0] : "";
  return `${name}(${value.slice(0, RESULT_WIDTH)})`;
}

function resultHead(text) {
  const lines = text.trim() ? text.trim().split("\n") : ["(no output)"];
  const shown = lines.slice(0, RESULT_LINES).map((line) => line.slice(0, RESULT_WIDTH));
  if (lines.length > RESULT_LINES) shown.push(`… +${lines.length - RESULT_LINES} lines`);
  return shown.map((line, i) => (i === 0 ? "  ⎿  " : "     ") + line).join("\n");
}

// The time worked: the gaps between messages, each counted up to MAX_PAUSE. The span from the
// first message to the last would count a session left open overnight as a day of work.
function timeWorked(times) {
  let ms = 0;
  for (let i = 1; i < times.length; i++)
    ms += Math.min(Date.parse(times[i]) - Date.parse(times[i - 1]), MAX_PAUSE_MS);
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

// What the person typed: a shell command after "!" stays, a pasted text loses only its tags.
function cleanPrompt(text) {
  return text
    .replace(ENVIRONMENT_BLOCKS, "")
    .replace(/<bash-input>([\s\S]*?)<\/bash-input>/g, "! $1")
    .replace(/<\/?pasted_content[^>]*>/g, "")
    .trim();
}

function stamp(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`;
}

// records: the parsed lines of one session. Returns { name, text } or null without messages.
export function exportSession(records, timeZone) {
  const messages = records.filter(
    (r) => (r.type === "user" || r.type === "assistant") && !r.isSidechain && !r.isMeta,
  );
  if (messages.length === 0) return null;
  const times = messages.map((r) => r.timestamp).sort();

  const out = [];
  for (const record of messages) {
    const content = record.message.content;
    if (record.type === "user") {
      if (Array.isArray(content) && content.some((b) => b.type === "tool_result")) {
        out.push(resultHead(textOf(content)) + "\n");
        continue;
      }
      if (record.isCompactSummary) {
        out.push("> [summary of the earlier conversation]\n");
        continue;
      }
      const text = cleanPrompt(textOf(content));
      const isCommand = text.includes("<command-name>");
      if (!isCommand && (!text || NOISE.some((n) => text.startsWith(n)))) continue;
      const prompt = promptOf(text);
      out.push("> " + prompt.replaceAll("\n", "\n  ") + "\n");
      continue;
    }
    for (const block of Array.isArray(content) ? content : []) {
      if (block.type === "text" && block.text.trim())
        out.push("⏺ " + block.text.trim().replaceAll("\n", "\n  ") + "\n");
      else if (block.type === "tool_use") out.push("⏺ " + toolSummary(block));
    }
  }
  const name = `${stamp(times[0], timeZone)}-${timeWorked(times)}.txt`;
  return { name, text: out.join("\n") };
}

// The files of earlier exports of the same session: same start, other time worked. Only those
// go — an export whose .jsonl Claude Code has since removed stays.
export function staleExports(existing, name) {
  const start = name.slice(0, "YYYY-MM-DD-HHMM-".length);
  return existing.filter(
    (file) => file !== name && file.startsWith(start) && file.endsWith(".txt"),
  );
}

function parseLines(text) {
  return text.split("\n").flatMap((line) => {
    try {
      return line ? [JSON.parse(line)] : [];
    } catch {
      return []; // a line cut off by a session still being written
    }
  });
}

function main() {
  const from = process.argv[2] ?? claudeProjectDir(process.cwd());
  const to = process.argv[3] ?? "docs/session";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter((f) => f.endsWith(".jsonl"));
  let written = 0;
  for (const file of files) {
    const session = exportSession(parseLines(readFileSync(join(from, file), "utf8")), timeZone);
    if (!session) continue;
    for (const stale of staleExports(readdirSync(to), session.name)) rmSync(join(to, stale));
    writeFileSync(join(to, session.name), session.text);
    written++;
  }
  console.log(`Exported ${written} sessions from ${from} to ${to}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
