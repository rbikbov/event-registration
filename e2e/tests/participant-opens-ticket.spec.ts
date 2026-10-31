import { expect, test, type APIRequestContext } from "@playwright/test";

// Created by `create_demo_users` when the backend starts (docs/architecture.md, "Окружение").
const ORGANIZER = { email: "demo@example.com", password: "demo" };
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

// The worker sends the email after the registration commits, so it is polled for. The mailbox
// is shared and never cleared: the unique address is what finds this test's email.
async function emailTo(request: APIRequestContext, address: string): Promise<string> {
  const search = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`;
  let id = "";
  await expect
    .poll(async () => {
      const found = (await (await request.get(search)).json()) as { messages: { ID: string }[] };
      id = found.messages[0]?.ID ?? "";
      return id;
    })
    .not.toBe("");
  const message = (await (await request.get(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
    Text: string;
  };
  return message.Text;
}

function extract(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (match?.[1] === undefined) throw new Error(`No ${String(pattern)} in the email`);
  return match[1];
}

test("the ticket email leads to the ticket page, where the participant cancels", async ({
  browser,
  request,
}) => {
  const title = `Ticket ${Date.now()}`;
  const startsAt = `${new Date().getFullYear() + 1}-05-01T18:00`;

  const organizerContext = await browser.newContext();
  const organizer = await organizerContext.newPage();
  await organizer.goto("/login");
  await organizer.getByLabel("Email").fill(ORGANIZER.email);
  await organizer.getByLabel("Пароль").fill(ORGANIZER.password);
  await organizer.getByRole("button", { name: "Войти" }).click();
  await organizer.getByRole("link", { name: "Создать событие" }).click();
  await organizer.getByLabel("Название", { exact: true }).fill(title);
  await organizer.getByLabel("Начало", { exact: true }).fill(startsAt);
  await organizer.getByLabel("Мест", { exact: true }).fill("5");
  await organizer.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(organizer.getByRole("heading", { name: title })).toBeVisible();
  await organizerContext.close();

  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  const consoleErrors: string[] = [];
  participant.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const email = `ticket-${Date.now()}@example.com`;
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Имя").fill("Анна");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");

  const text = await emailTo(request, email);
  const code = extract(text, /Код билета: (\S+)/);
  const link = extract(text, /(http\S+\/tickets\/\S+)/);

  await participant.goto(link);
  await expect(participant.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(participant.getByText(code, { exact: true })).toBeVisible();

  await participant.getByRole("button", { name: "Отказаться" }).click();
  await participant.getByRole("button", { name: "Да, отказаться" }).click();

  await expect(participant.getByText("Регистрация отменена")).toBeVisible();
  await expect(participant.getByText(code, { exact: true })).toBeHidden();
  expect(consoleErrors).toEqual([]);
  await participantContext.close();
});
