import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract, openEventEdit, registerOn } from "./helpers";

// As the emails write it: UTC, events have no time zone of their own.
function emailTime(local: string): string {
  const at = new Date(local);
  // A fixed table, as in the backend: Intl's en-GB writes "Sept".
  const month = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[at.getUTCMonth()];
  const iso = at.toISOString();
  return `${iso.slice(8, 10)} ${month} ${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
}

test("a rescheduled event emails the confirmed and the waitlisted", async ({
  browser,
  request,
}) => {
  const stamp = Date.now();
  const title = `Reschedule ${stamp}`;
  await createEvent(browser, { title, capacity: 1 });
  const participant = await (await browser.newContext()).newPage();
  const seatEmail = `reschedule-seat-${stamp}@example.com`;
  const waitingEmail = `reschedule-waiting-${stamp}@example.com`;
  await registerOn(participant, title, seatEmail, "Anna");
  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");
  await registerOn(participant, title, waitingEmail, "Boris");
  await expect(participant.getByRole("status")).toHaveText("You are on the waitlist, #1");
  await participant.context().close();

  const organizer = await openEventEdit(browser, title);
  const newStart = `${new Date().getFullYear() + 1}-05-02T19:30`;
  await organizer.getByLabel("Start", { exact: true }).fill(newStart);
  await organizer.getByRole("button", { name: "Save" }).click();
  await expect(
    organizer.getByText(
      "The participants (confirmed 1, waitlisted 1) will get a reschedule email.",
    ),
  ).toBeVisible();
  await organizer.getByRole("button", { name: "Reschedule" }).click();
  await expect(organizer.getByRole("status")).toHaveText("Saved");
  await organizer.context().close();

  const code = extract(await emailTo(request, seatEmail, "Ticket"), /Ticket code: (\S+)/);
  const toSeat = await emailTo(request, seatEmail, "Event rescheduled");
  expect(toSeat).toContain(`Now: ${emailTime(newStart)}`);
  expect(toSeat).toContain(code);
  const toWaiting = await emailTo(request, waitingEmail, "Event rescheduled");
  expect(toWaiting).toContain(`Now: ${emailTime(newStart)}`);
  expect(toWaiting).toContain("You are on the waitlist");
});
