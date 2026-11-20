import { describe, expect, it } from "vitest";

// Every component keeps its texts in an English and a Russian <i18n> block. Nothing shows the
// Russian ones until a language switch (docs/decisions.md, 2026-11-21 01:19), so this test is
// what keeps the two from drifting apart: a text added in one language only fails here.
const sources = import.meta.glob<string>("/src/**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Components not translated yet (tasks 1.2–1.3 of docs/features/english-ui/tasks.md): they still
// show Russian through the fallback. Each one leaves the list in the commit that translates it.
const PENDING = [
  "/src/pages/event/ui/EventPage.vue",
  "/src/pages/health/ui/HealthPage.vue",
  "/src/pages/login/ui/LoginPage.vue",
  "/src/pages/org-checkin/ui/OrgCheckinPage.vue",
  "/src/pages/org-event-edit/ui/OrgEventEditPage.vue",
  "/src/pages/org-event-new/ui/OrgEventNewPage.vue",
  "/src/pages/org-event-participants/ui/OrgEventParticipantsPage.vue",
  "/src/pages/org-event/ui/OrgEventLayout.vue",
  "/src/pages/ticket/ui/TicketPage.vue",
  "/src/shared/ui/error-state/NotFound.vue",
  "/src/shared/ui/expandable-text/ExpandableText.vue",
  "/src/shared/ui/page-nav/PageNav.vue",
  "/src/shared/ui/query-state/QueryState.vue",
  "/src/shared/ui/query-state/RetryAlert.vue",
];

const BLOCK = /<i18n lang="json" locale="(\w+)">([\s\S]*?)<\/i18n>/g;

function blocks(source: string): Map<string, unknown> {
  const found = new Map<string, unknown>();
  for (const [, locale = "", json = ""] of source.matchAll(BLOCK))
    found.set(locale, JSON.parse(json));
  return found;
}

// "a", "b.c" for { a: "…", b: { c: "…" } }, with the number of plural forms of a text left out:
// English has two, Russian three.
function keys(messages: unknown, prefix = ""): string[] {
  if (typeof messages !== "object" || messages === null) return [prefix];
  return Object.entries(messages)
    .flatMap(([key, value]) => keys(value, prefix ? `${prefix}.${key}` : key))
    .sort();
}

const translated = Object.entries(sources)
  .map(([path, source]) => ({ path, locales: blocks(source) }))
  .filter(({ locales }) => locales.size > 0);

describe("i18n blocks", () => {
  it("every component with texts has an English block, except the pending ones", () => {
    const withoutEnglish = translated
      .filter(({ locales }) => !locales.has("en"))
      .map((c) => c.path);
    expect(withoutEnglish.sort()).toEqual([...PENDING].sort());
  });

  it.each(translated.filter(({ locales }) => locales.has("en")).map((c) => [c.path, c.locales]))(
    "%s has the same keys in English and Russian",
    (_, locales) => {
      expect(keys(locales.get("en"))).toEqual(keys(locales.get("ru")));
    },
  );
});
