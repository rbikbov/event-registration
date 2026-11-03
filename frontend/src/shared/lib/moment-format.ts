// When something happened (a check-in at the entrance), with as much of the date as tells that
// moment apart from now: the time alone today, the day for another day of this year, the year
// for another year. Russian says "2 ноября в 23:50" for the day and month together with the time.
export function momentFormat(at: Date, now: Date): Intl.DateTimeFormatOptions {
  const time = { hour: "2-digit", minute: "2-digit" } as const;
  if (sameDay(at, now)) return time;
  const day = { ...time, day: "numeric", month: "long" } as const;
  if (at.getFullYear() === now.getFullYear()) return day;
  return { ...day, year: "numeric" };
}

// The same calendar day where the browser is: ten minutes before midnight is yesterday.
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
