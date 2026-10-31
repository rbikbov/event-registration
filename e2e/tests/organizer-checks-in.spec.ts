import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract, organizerPage } from "./helpers";

test("the code from the email passes check-in once, and the panel counts the arrival", async ({
  browser,
  request,
}) => {
  const title = `Check-in ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const participant = await (await browser.newContext()).newPage();
  const email = `checkin-${Date.now()}@example.com`;
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Имя").fill("Анна");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await participant.context().close();
  const code = extract(await emailTo(request, email, "Билет"), /Код билета: (\S+)/);

  const organizer = await organizerPage(browser);
  const consoleErrors: string[] = [];
  organizer.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await organizer.getByRole("link", { name: title }).click();
  await organizer.getByRole("link", { name: "Чекин" }).click();
  await expect(organizer.getByRole("heading", { name: `Чекин: ${title}` })).toBeVisible();

  await organizer.getByLabel("Код билета").fill(code);
  await organizer.getByRole("button", { name: "Отметить" }).click();
  await expect(organizer.getByText("Пропущен", { exact: true })).toBeVisible();
  await expect(organizer.getByText("Анна")).toBeVisible();

  // The organizer moves on and the same code comes again: it is turned away.
  await organizer.getByRole("button", { name: "Следующий" }).click();
  await organizer.getByLabel("Код билета").fill(code);
  await organizer.getByRole("button", { name: "Отметить" }).click();
  await expect(organizer.getByText(/^Уже отмечен в \d{2}:\d{2}$/)).toBeVisible();
  await expect(organizer.getByText("Пропущен", { exact: true })).toBeHidden();

  await organizer.getByRole("link", { name: "Панель события" }).click();
  const arrived = organizer
    .locator("dl > div")
    .filter({ has: organizer.getByRole("term").getByText("Пришло", { exact: true }) });
  await expect(arrived.getByRole("definition")).toHaveText("1");
  await expect(organizer.getByRole("row", { name: /Анна/ })).toContainText(email);
  expect(consoleErrors).toEqual([]);
  await organizer.context().close();
});
