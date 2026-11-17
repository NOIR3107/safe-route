/**
 * Clicks through every feature against the live backend, not just page loads. Each test fails on a
 * console error or on any API call that returns 4xx/5xx (unless the test expects it).
 * It changes data: reseed afterwards (`python -m app.seed` in backend/).
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAs, trackConsole } from "./helpers";

function trackApiErrors(page: Page, allow: RegExp[] = []): string[] {
  const bad: string[] = [];
  page.on("response", (r) => {
    if (!r.url().includes("/api/v1/") || r.status() < 400) return;
    const line = `${r.request().method()} ${r.url().replace(/^.*\/api\/v1/, "")} -> ${r.status()}`;
    if (!allow.some((a) => a.test(line))) bad.push(line);
  });
  return bad;
}

async function clean(errors: string[], api: string[]) {
  expect(errors, errors.join("\n")).toEqual([]);
  expect(api, api.join("\n")).toEqual([]);
}

// Whatever a test does, the next one starts on live data.
test.afterEach(async () => {
  const API = "http://localhost:8000/api/v1";
  const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "coordinator@saferoute.org", password: "Coord@12345" }) });
  const { access_token } = (await login.json()) as { access_token: string };
  await fetch(`${API}/drill/control`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` }, body: JSON.stringify({ type: "end" }) });
});

async function submitDialog(page: Page, button: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("an expired session signs out and explains why", async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto("/login");
  await page.evaluate(() =>
    localStorage.setItem("saferoute-auth", JSON.stringify({ state: { token: "expired.token.value", user: { user_id: 1, name: "System Administrator", email: "admin@saferoute.org", role: "Admin", scope: { user_id: 1, shelter_id: null, team_id: null, zone_ids: null } } }, version: 0 })),
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId("session-expired")).toBeVisible();
  await page.getByTestId("demo-login-admin").click();
  await expect(page.getByTestId("role-switcher")).toBeVisible();
  await expect(page.getByTestId("session-expired")).toHaveCount(0);
  expect(errors.filter((e) => !/401/.test(e))).toEqual([]);
});

test("coordinator: generate, compare, explain, approve, override, versions", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackConsole(page);
  const api = trackApiErrors(page);
  await loginAs(page, "evacuation-coordinator");

  await page.goto("/plan");
  await page.getByRole("radio", { name: "Greedy" }).click();
  await page.getByTestId("generate-plan").click();
  await expect(page.getByText(/Plan v\d+ proposed/).first()).toBeVisible();
  const before = await page.getByText(/Plan v\d+ proposed/).count();
  await page.getByRole("radio", { name: "Min-Cost Flow" }).click();
  await page.getByTestId("generate-plan").click();
  await expect.poll(() => page.getByText(/Plan v\d+ proposed/).count()).toBeGreaterThan(before);
  await expect(page.getByTestId("assignment-row").first()).toBeVisible();

  await page.getByRole("button", { name: /Compare strategies/ }).click();
  await expect(page.getByText("Strategy comparison")).toBeVisible();
  await page.getByRole("button", { name: /Hide comparison/ }).click();

  await page.getByLabel("Filter by status").selectOption("All");
  await page.getByTestId("assignment-row").first().click();
  const drawer = page.getByTestId("explanation-drawer");
  await expect(drawer.getByText("Cost breakdown")).toBeVisible();
  await expect(drawer.getByText("Alternatives considered")).toBeVisible();
  const approve = drawer.getByTestId("approve-version");
  if (await approve.isVisible()) {
    await approve.click();
    await expect(page.getByText(/approved/i).first()).toBeVisible();
  }
  await page.keyboard.press("Escape");

  // override the first Scheduled assignment that offers another shelter
  await page.getByLabel("Filter by status").selectOption("Scheduled");
  const rows = page.getByTestId("assignment-row");
  let done = false;
  for (let i = 0; i < Math.min(await rows.count(), 12) && !done; i++) {
    await rows.nth(i).click();
    const btn = page.getByTestId("override-open");
    const enabled = await expect(btn).toBeEnabled({ timeout: 3000 }).then(() => true, () => false);
    if (enabled) {
      await btn.click();
      await page.getByLabel(/Reason/).fill("Family has relatives near the other shelter");
      await page.getByRole("button", { name: "Apply override" }).click();
      await expect(page.getByText(/Override applied/).first()).toBeVisible();
      done = true;
    }
    await page.keyboard.press("Escape");
  }
  expect(done, "no assignment could be overridden").toBe(true);

  await page.goto("/plan/versions");
  await expect(page.getByTestId("version-item").first()).toBeVisible();
  await page.getByTestId("version-item").first().click();
  await expect(page.getByTestId("version-detail")).toBeVisible();

  // dashboard: approve from the dock if a version is waiting, layers, 2D/3D, map selection
  await page.goto("/");
  await expect(page.getByTestId("kpi-at-risk")).toBeVisible();
  const dock = page.getByTestId("dock-approve");
  if (await dock.isVisible()) await dock.click();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator("button", { hasText: "Loyola College Auditorium" }).first().click();
  await expect(page.getByTestId("map-detail")).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("radio", { name: "3D" }).click();
  await expect(page.getByRole("radio", { name: "3D" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "2D" }).click();
  await clean(errors, api);
});

test("coordinator: drill start, speed, inject every event, replay, reset, scenarios, end", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackConsole(page);
  const api = trackApiErrors(page);
  await loginAs(page, "evacuation-coordinator");
  await page.goto("/drill");
  await page.getByTestId("drill-play").click();
  await page.getByRole("radio", { name: "16×" }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText(/T\+(2[2-9]|[3-9]\d)/, { timeout: 60_000 });
  await page.getByTestId("drill-pause").click();
  await expect(page.getByTestId("data-mode")).toHaveText("DRILL");

  await page.getByTestId("inject-block-route").click();
  await expect(page.getByText(/Injected/).first()).toBeVisible();
  await page.getByRole("button", { name: /Power loss/ }).click();
  await page.getByRole("button", { name: /^Close$/ }).click();
  await page.getByRole("button", { name: /Surge/ }).click();
  await expect(page.getByTestId("drill-latest-version")).toContainText(/Plan v\d+/);

  await page.getByRole("button", { name: /Replay/ }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText(/T\+\d+/);
  await page.getByTestId("drill-pause").click().catch(() => {});
  await page.getByRole("button", { name: /^Reset/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText(/T\+0/);

  await page.getByLabel("Scenario", { exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Load scenario" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByText(/synthetic/i).first()).toBeVisible();
  await page.getByLabel("Scenario", { exact: true }).selectOption({ index: 0 });
  await page.getByRole("button", { name: "Load scenario" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Load", exact: true }).click();

  await page.getByTestId("drill-end").click();
  await expect(page.getByTestId("data-mode")).toHaveText("LIVE");
  await clean(errors, api);
});

test("admin: register and edit zones, shelters, routes, vehicles, teams; status changes", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackConsole(page);
  const api = trackApiErrors(page);
  const tag = Date.now().toString().slice(-5);
  await loginAs(page, "admin");

  await page.goto("/zones");
  await page.getByRole("button", { name: /Register zone/ }).click();
  await page.getByLabel("Zone name").fill(`Test Zone ${tag}`);
  await page.getByLabel(/^Location/).fill("Kodambakkam test area");
  await page.getByLabel(/Population/).fill("120");
  await submitDialog(page, "Register");
  await expect(page.getByText(`Test Zone ${tag}`)).toBeVisible();
  await page.getByRole("button", { name: `Edit Test Zone ${tag}` }).click();
  await page.getByLabel(/Population/).fill("150");
  await submitDialog(page, "Save");

  await page.goto("/shelters");
  await page.getByRole("button", { name: /Register shelter/ }).click();
  await page.getByLabel("Name").fill(`Test Shelter ${tag}`);
  await page.getByLabel(/^Location/).fill("Ashok Nagar test hall");
  await page.getByLabel("Total capacity").fill("300");
  await page.getByLabel("Current occupancy").fill("0");
  await page.getByLabel("Facilities (comma-separated)").fill("Water, Food");
  await page.getByLabel("Latitude").fill("13.0370");
  await page.getByLabel("Longitude").fill("80.2120");
  await submitDialog(page, "Register");
  await expect(page.getByText(`Test Shelter ${tag}`)).toBeVisible();
  await page.getByRole("button", { name: `Status for Test Shelter ${tag}` }).click();
  await page.getByRole("menuitem").first().click();

  await page.goto("/routes");
  await page.getByRole("button", { name: /Add route/ }).click();
  await page.getByLabel("From zone").selectOption({ index: 0 });
  await page.getByLabel("To shelter").selectOption({ index: 0 });
  await submitDialog(page, "Add route");
  const statusBtn = page.getByRole("button", { name: /^Status for / }).first();
  await statusBtn.click();
  await page.getByRole("menuitem").first().click();

  await page.goto("/fleet");
  await page.getByRole("button", { name: /Add vehicle/ }).click();
  await page.getByLabel("Seats").fill("12");
  await page.getByLabel("Plate / call sign").fill(`TN-TEST-${tag}`);
  await page.getByLabel("Depot / location").fill("Guindy depot");
  await submitDialog(page, "Add");
  await expect(page.getByText(`TN-TEST-${tag}`)).toBeVisible();
  await page.getByRole("tab", { name: "Rescue teams" }).click();
  await page.getByRole("button", { name: /Add team/ }).click();
  await page.getByLabel("Team name").fill(`Test Team ${tag}`);
  await page.getByLabel("Members").fill("6");
  await page.getByLabel("Contact number").fill("+91-9000000000");
  await submitDialog(page, "Add");
  await expect(page.getByText(`Test Team ${tag}`)).toBeVisible();
  await clean(errors, api);
});

test("shelter manager: check-in, walk-in, reunification", async ({ page }) => {
  const errors = trackConsole(page);
  const api = trackApiErrors(page);
  await loginAs(page, "shelter-manager");
  await page.goto("/checkin");
  const before = Number((await page.getByTestId("live-occupancy").innerText()).replace(/\D/g, ""));
  await page.locator("button:enabled", { hasText: /^Check in$/ }).first().click();
  await expect(page.getByTestId("live-occupancy")).not.toHaveText(String(before));
  await page.getByLabel("Head of household").fill("Test Walk-in Family");
  await page.getByLabel("People", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText(/walk-in/i).first()).toBeVisible();
  await page.locator("#reunify").fill("Lakshmi");
  await expect(page.getByText(/HH-|SR-/).first()).toBeVisible();
  await clean(errors, api);
});

test("response team: pickup and arrival, offline queue", async ({ page }) => {
  const errors = trackConsole(page);
  const api = trackApiErrors(page);
  await loginAs(page, "response-team");
  await page.goto("/field");
  const task = page.getByTestId("field-task").first();
  await expect(task).toBeVisible();
  await task.click();
  const pickAll = page.getByRole("button", { name: /Mark all picked up/ }).first();
  await expect(pickAll).toBeEnabled();
  await pickAll.click();
  await page.getByRole("button", { name: /Arrived at shelter/ }).first().click();
  await expect(page.getByText(/arriv|reached|delivered/i).first()).toBeVisible();
  await clean(errors, api);
});

test("commander: audit filters and notifications", async ({ page }) => {
  const errors = trackConsole(page);
  const api = trackApiErrors(page);
  await loginAs(page, "emergency-authority");
  await page.goto("/audit");
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
  await page.getByLabel("Search audit log").fill("PLAN");
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
  await page.getByRole("button", { name: /Notifications/ }).first().click();
  await page.keyboard.press("Escape");
  await clean(errors, api);
});

test("public page: lookup in English, Hindi and Tamil", async ({ page }) => {
  const errors = trackConsole(page);
  const api = trackApiErrors(page);
  await page.goto("/public");
  for (const lang of ["English", "हिन्दी", "தமிழ்"]) {
    await page.getByRole("radio", { name: lang }).click();
    await page.locator("#lookup").fill("VEL");
    await page.locator("#lookup").press("Enter");
    await expect(page.getByTestId("public-result").first()).toBeVisible();
  }
  await clean(errors, api);
});
