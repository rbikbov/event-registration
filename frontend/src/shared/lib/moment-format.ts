/** How a component formats a date: its `d` from vue-i18n, so the locale stays with i18n. */
export type FormatDate = (at: Date, options: Intl.DateTimeFormatOptions) => string;

/**
 * When something happened (a check-in at the entrance), with as much of the date as tells that
 * moment apart from now: the time alone today, the day for another day of this year, the year
 * for another year. Russian says "2 ноября в 23:50" with the date, but "в 09:15" needs its "в"
 * from the phrase: `withAt` tells the component to put its own "в {time}" around the text.
 */
export function formatMoment(
  iso: string,
  now: Date,
  format: FormatDate,
): { text: string; withAt: boolean } {
  const at = new Date(iso);
  const time = { hour: "2-digit", minute: "2-digit" } as const;
  if (sameDay(at, now)) return { text: format(at, time), withAt: true };
  const day = { ...time, day: "numeric", month: "long" } as const;
  const options: Intl.DateTimeFormatOptions =
    at.getFullYear() === now.getFullYear() ? day : { ...day, year: "numeric" };
  return { text: format(at, options), withAt: false };
}

// The same calendar day where the browser is: ten minutes before midnight is yesterday.
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
