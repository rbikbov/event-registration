import { expect, test } from "@playwright/test";

import { createEvent, emailTo, extract, organizerPage, panelStat } from "./helpers";

test("a lost stream shows the indicator, and the counters are right once it is back", async ({
  browser,
  request,
}) => {
  const title = `Reconnect ${Date.now()}`;
  await createEvent(browser, { title, capacity: 5 });

  const participant = await (await browser.newContext()).newPage();
  const email = `reconnect-${Date.now()}@example.com`;
  await participant.goto("/");
  await participant.getByRole("link", { name: title }).click();
  await participant.getByLabel("Email").fill(email);
  await participant.getByLabel("Имя").fill("Дина");
  await participant.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(participant.getByRole("status")).toHaveText("Место подтверждено");
  await participant.context().close();
  const code = extract(await emailTo(request, email, "Билет"), /Код билета: (\S+)/);

  const panel = await organizerPage(browser);
  // The first stream ends right away, as one the gateway dropped; while the route is there, the
  // connections after it get what the gateway answers while the backend restarts.
  let streams = 0;
  await panel.route("**/stream/", async (route) => {
    streams += 1;
    await (streams === 1
      ? route.fulfill({ contentType: "text/event-stream", body: "retry: 3000\n\n" })
      : route.fulfill({ status: 502 }));
  });
  await panel.getByRole("link", { name: title }).click();
  await expect(panelStat(panel, "Пришло")).toHaveText("0");
  const indicator = panel.getByText("Соединение потеряно, переподключаюсь…");
  await expect(indicator).toBeVisible();
  // EventSource reconnects after `retry` and gives up on the 502; the panel opens it again 3 s later.
  await expect.poll(() => streams, { timeout: 10_000 }).toBeGreaterThan(2);

  // A check-in nobody on the panel hears of: only the snapshot of reconnecting brings it.
  const entrance = await organizerPage(browser);
  await entrance.getByRole("link", { name: title }).click();
  await entrance.getByRole("link", { name: "Чекин" }).click();
  await entrance.getByLabel("Код билета").fill(code);
  await entrance.getByRole("button", { name: "Отметить" }).click();
  await expect(entrance.getByText("Пропущен", { exact: true })).toBeVisible();
  await entrance.context().close();
  await expect(indicator).toBeVisible();
  await expect(panelStat(panel, "Пришло")).toHaveText("0");

  await panel.unroute("**/stream/");

  await expect(indicator).toBeHidden();
  await expect(panelStat(panel, "Пришло")).toHaveText("1");
  await panel.context().close();
});
