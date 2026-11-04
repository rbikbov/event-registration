// Exports every Claude Code session of this project as text close to the built-in `/export`,
// which exports only the current session; resuming an old one to export it would append to it.
// Reads ~/.claude/projects/<project>/*.jsonl and never writes there. Subagent transcripts (in
// per-session folders) and the model's thinking are left out, as in `/export`. A file is named
// after the session's first record, so running it again overwrites the same files and adds
// the sessions that are new.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RESULT_LINES = 6;
const RESULT_WIDTH = 200;
const NOISE = ["<local-command-caveat>", "<local-command-stdout>", "<system-reminder>", "Caveat:"];
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

function slug(text) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return words.slice(0, 8).join("-").slice(0, 60).replace(/-+$/, "") || "session";
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
  const started = messages.map((r) => r.timestamp).sort()[0];

  const out = [];
  let firstPrompt = "";
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
      const text = textOf(content);
      const isCommand = text.includes("<command-name>");
      if (!isCommand && (!text.trim() || NOISE.some((n) => text.trim().startsWith(n)))) continue;
      const prompt = promptOf(text);
      if (!isCommand && !firstPrompt) firstPrompt = prompt.replace(/<\/?[\w-]+[^>]*>/g, " ");
      out.push("> " + prompt.replaceAll("\n", "\n  ") + "\n");
      continue;
    }
    for (const block of Array.isArray(content) ? content : []) {
      if (block.type === "text" && block.text.trim())
        out.push("⏺ " + block.text.trim().replaceAll("\n", "\n  ") + "\n");
      else if (block.type === "tool_use") out.push("⏺ " + toolSummary(block));
    }
  }
  return { name: `${stamp(started, timeZone)}-${slug(firstPrompt)}.txt`, text: out.join("\n") };
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
    writeFileSync(join(to, session.name), session.text);
    written++;
  }
  console.log(`Exported ${written} sessions from ${from} to ${to}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
