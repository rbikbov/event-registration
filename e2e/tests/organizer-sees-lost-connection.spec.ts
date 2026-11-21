import { expect, test } from "@playwright/test";

import { checkInAnswer, createEvent, emailTo, extract, organizerPage, panelStat } from "./helpers";

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
  await participant.getByLabel("Name").fill("Dina");
  await participant.getByRole("button", { name: "Register" }).click();
  await expect(participant.getByRole("status")).toHaveText("Seat confirmed");
  await participant.context().close();
  const code = extract(await emailTo(request, email, "Ticket"), /Ticket code: (\S+)/);

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
  await expect(panelStat(panel, "Checked in")).toHaveText("0");
  const indicator = panel.getByText("Connection lost, reconnecting…");
  await expect(indicator).toBeVisible();
  // EventSource reconnects after `retry` and gives up on the 502; the panel opens it again 3 s later.
  await expect.poll(() => streams, { timeout: 10_000 }).toBeGreaterThan(2);

  // A check-in nobody on the panel hears of: only the snapshot of reconnecting brings it.
  const entrance = await organizerPage(browser);
  await entrance.getByRole("link", { name: title }).click();
  await entrance.getByRole("link", { name: "Check-in" }).click();
  await entrance.getByLabel("Ticket code").fill(code);
  await entrance.getByRole("button", { name: "Check in" }).click();
  await expect(checkInAnswer(entrance, "Checked in")).toBeVisible();
  await entrance.context().close();
  await expect(indicator).toBeVisible();
  await expect(panelStat(panel, "Checked in")).toHaveText("0");

  await panel.unroute("**/stream/");

  await expect(indicator).toBeHidden();
  await expect(panelStat(panel, "Checked in")).toHaveText("1");
  await panel.context().close();
});
