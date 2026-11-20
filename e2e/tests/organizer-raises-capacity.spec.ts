import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract, openEventEdit, panelStat, registerOn } from "./helpers";

test("a larger capacity gives the waitlist head a seat and an email with the ticket", async ({
  browser,
  request,
}) => {
  const stamp = Date.now();
  const title = `Capacity ${stamp}`;
  await createEvent(browser, { title, capacity: 1 });
  const participant = await (await browser.newContext()).newPage();
  const waitingEmail = `capacity-waiting-${stamp}@example.com`;
  await registerOn(participant, title, `capacity-seat-${stamp}@example.com`, "Anna");
  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");
  await registerOn(participant, title, waitingEmail, "Boris");
  await expect(participant.getByRole("status")).toHaveText("You are on the waitlist, #1");
  await participant.context().close();

  const organizer = await openEventEdit(browser, title);
  await organizer.getByLabel("Seats", { exact: true }).fill("2");
  await organizer.getByRole("button", { name: "Save" }).click();
  await expect(organizer.getByRole("status")).toHaveText("Saved");
  await expect(panelStat(organizer, "Confirmed")).toHaveText("2");
  await expect(panelStat(organizer, "Waitlisted")).toHaveText("0");
  await organizer.context().close();

  const promoted = await emailTo(request, waitingEmail, "A seat became free");
  const link = extract(promoted, /(http\S+\/tickets\/\S+)/);
  const code = extract(promoted, /Ticket code: (\S+)/);
  const ticket = await (await browser.newContext()).newPage();
  await ticket.goto(link);
  await expect(ticket.getByText(code, { exact: true })).toBeVisible();
  await ticket.context().close();
});
