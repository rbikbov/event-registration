import { createI18n } from "vue-i18n";

// Russian plural forms: "1 место | 2 места | 5 мест". vue-i18n's default rule knows only
// zero/one/other for three forms.
export function russianPlural(count: number): 0 | 1 | 2 {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return 0;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 1;
  return 2;
}

// British English: 24-hour time and the day before the month, as in Russian, and Intl puts "at"
// between a date and a time by itself ("31 October at 09:15"). The message blocks are
// `locale="en"`: vue-i18n looks for `en-GB`, then `en`, then the fallback.
export type AppLocale = "en-GB" | "ru";

// The two ways the app shows when an event starts: `short` in lists, `long` on a page of one
// event (the event, the ticket, the organizer's event). A component formats with `d(date, name)`.
const formats = {
  short: { dateStyle: "medium", timeStyle: "short" },
  long: { dateStyle: "long", timeStyle: "short" },
} as const;
const datetimeFormats = { "en-GB": formats, ru: formats };

// Messages are not global: each component keeps its own in <i18n> blocks next to the template
// (useI18n({ useScope: "local" })). English is shown; the Russian blocks are kept for a later
// language switch (docs/decisions.md, 2026-11-21 01:19) and are the fallback for a text without
// an English version.
export function createAppI18n(locale: AppLocale = "en-GB") {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: ["en", "ru"],
    pluralRules: { ru: russianPlural },
    datetimeFormats,
  });
}
