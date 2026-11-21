import { createI18n } from "vue-i18n";

// British English: 24-hour time and the day before the month, and Intl puts "at" between a date
// and a time by itself ("31 October at 09:15"). The message blocks are `locale="en"`: vue-i18n
// looks for `en-GB`, then `en`.
const LOCALE = "en-GB";

// The two ways the app shows when an event starts: `short` in lists, `long` on a page of one
// event (the event, the ticket, the organizer's event). A component formats with `d(date, name)`.
const datetimeFormats = {
  [LOCALE]: {
    short: { dateStyle: "medium", timeStyle: "short" },
    long: { dateStyle: "long", timeStyle: "short" },
  },
} as const;

// Messages are not global: each component keeps its own in an <i18n> block next to the template
// (useI18n({ useScope: "local" })).
export function createAppI18n() {
  return createI18n({
    legacy: false,
    locale: LOCALE,
    fallbackLocale: "en",
    datetimeFormats,
  });
}
