/**
 * The "Done means" demo flow, end to end in a real browser:
 * Coordinator → dashboard → generate plan → "why" explanation → start drill → block a route →
 * re-planning + plan diff → override → audit log shows the override. Fails on any console error.
 */
import { expect, test } from "@playwright/test";
import { loginAs, switchRole, trackConsole } from "./helpers";

test("coordinator demo flow", async ({ page }) => {
  const errors = trackConsole(page);

  // 1. Log in as Coordinator → Command Dashboard
  await loginAs(page, "evacuation-coordinator");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("People evacuated vs remaining")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();

  // 2. Generate a plan
  await page.getByTestId("generate-plan").click();
  await expect(page.getByText(/Plan v1 proposed/).first()).toBeVisible();

  // 3. Open a "Why this shelter?" explanation
  await page.getByRole("link", { name: "Allocation Plan", exact: true }).click();
  await page.getByTestId("assignment-row").first().click();
  const drawer = page.getByTestId("explanation-drawer");
  await expect(drawer.getByText("Cost breakdown")).toBeVisible();
  await expect(drawer.getByText("Alternatives considered")).toBeVisible();
  await drawer.getByTestId("approve-version").click();
  await expect(page.getByText("Plan v1 approved").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // 4. Start a drill at high speed and let the scripted bridge flood fire (T+20)
  await page.getByRole("link", { name: "Simulation / Drill", exact: true }).click();
  await page.getByRole("radio", { name: "16×" }).click();
  await page.getByTestId("drill-play").click();
  await expect(page.getByTestId("sim-clock")).toHaveText(/T\+(2[2-9]|[3-9]\d)/, { timeout: 30_000 });
  await page.getByTestId("drill-pause").click();

  // 5. Block a route manually during the drill → immediate re-plan
  await page.getByTestId("inject-block-route").click();
  await expect(page.getByText(/Injected: Route R\d+/).first()).toBeVisible();
  await expect(page.getByTestId("drill-latest-version")).toContainText(/Plan v\d+/);

  // 6. Watch the plan diff
  await page.getByRole("link", { name: "Plan Versions", exact: true }).click();
  await expect(page.getByTestId("version-item").first()).toBeVisible();
  expect(await page.getByTestId("version-item").count()).toBeGreaterThan(1);
  await page.getByTestId("version-item").filter({ hasText: "Route blocked" }).first().click();
  await expect(page.getByTestId("version-detail")).toContainText("What changed");
  await expect(page.getByTestId("diff-move").first()).toBeVisible();

  // 7. Override an assignment with a reason
  await page.getByRole("link", { name: "Allocation Plan", exact: true }).click();
  await page.getByLabel("Filter by status").selectOption("Scheduled");
  const rows = page.getByTestId("assignment-row");
  const n = await rows.count();
  let overridden = false;
  for (let i = 0; i < n && !overridden; i++) {
    await rows.nth(i).click();
    const btn = page.getByTestId("override-open");
    if (await btn.isEnabled()) {
      await btn.click();
      await page.getByLabel(/Reason/).fill("Family has relatives near the alternative shelter");
      await page.getByRole("button", { name: "Apply override" }).click();
      await expect(page.getByText(/Override applied/).first()).toBeVisible();
      overridden = true;
    } else {
      await page.keyboard.press("Escape");
    }
  }
  expect(overridden).toBe(true);

  // 8. Audit log (Incident Commander) shows the override
  await switchRole(page, "Incident Commander");
  await page.getByRole("link", { name: "Audit & Notifications", exact: true }).click();
  await expect(page.getByTestId("audit-row").filter({ hasText: "ASSIGNMENT_OVERRIDE" }).first()).toBeVisible();
  await expect(page.getByTestId("audit-row").filter({ hasText: "relatives near the alternative" }).first()).toBeVisible();
  await expect(page.getByTestId("audit-row").filter({ hasText: "DYNAMIC_REALLOCATION" }).first()).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("RBAC: shelter manager is scoped and cannot open the plan", async ({ page }) => {
  const errors = trackConsole(page);
  await loginAs(page, "shelter-manager");
  await expect(page).toHaveURL(/\/checkin$/);
  await expect(page.getByTestId("live-occupancy")).toBeVisible();
  await page.goto("/plan");
  await expect(page.getByText("Access restricted")).toBeVisible();
  await page.goto("/shelters");
  await expect(page.getByText("Scoped to shelter #1")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("public page works without login, in Tamil", async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto("/public");
  await page.getByRole("radio", { name: "தமிழ்" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("கண்டறியுங்கள்");
  await page.getByLabel("மண்டலக் குறியீடு அல்லது தொலைபேசி எண்").fill("VEL");
  await page.getByRole("button", { name: "தேடு" }).click();
  await expect(page.getByTestId("public-result").first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});
