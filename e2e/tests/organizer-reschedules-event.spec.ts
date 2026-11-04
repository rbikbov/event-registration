import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract, openEventEdit, registerOn } from "./helpers";

// As the emails write it: UTC, events have no time zone of their own.
function emailTime(local: string): string {
  const iso = new Date(local).toISOString();
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
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
  await registerOn(participant, title, seatEmail, "Анна");
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await registerOn(participant, title, waitingEmail, "Борис");
  await expect(participant.getByRole("status")).toHaveText("Вы в листе ожидания, №1");
  await participant.context().close();

  const organizer = await openEventEdit(browser, title);
  const newStart = `${new Date().getFullYear() + 1}-05-02T19:30`;
  await organizer.getByLabel("Начало", { exact: true }).fill(newStart);
  await organizer.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    organizer.getByText("Участникам (подтверждено 1, в листе 1) уйдёт письмо о переносе."),
  ).toBeVisible();
  await organizer.getByRole("button", { name: "Перенести" }).click();
  await expect(organizer.getByRole("status")).toHaveText("Сохранено");
  await organizer.context().close();

  const code = extract(await emailTo(request, seatEmail, "Билет"), /Код билета: (\S+)/);
  const toSeat = await emailTo(request, seatEmail, "Событие перенесено");
  expect(toSeat).toContain(`Стало: ${emailTime(newStart)}`);
  expect(toSeat).toContain(code);
  const toWaiting = await emailTo(request, waitingEmail, "Событие перенесено");
  expect(toWaiting).toContain(`Стало: ${emailTime(newStart)}`);
  expect(toWaiting).toContain("Вы в листе ожидания");
});
