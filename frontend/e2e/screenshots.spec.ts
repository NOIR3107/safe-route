/**
 * Captures README screenshots of every main screen (docs/screenshots). Also a visual smoke test:
 * fails on console errors. Run with `npm run screenshots`.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAs, switchRole, trackConsole } from "./helpers";

const OUT = "../docs/screenshots";

async function shot(page: Page, name: string) {
  await page.waitForTimeout(700); // let tiles and transitions settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test("capture screens", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackConsole(page);

  await page.goto("/login");
  await expect(page.getByText("Demo mode: sign in as a role")).toBeVisible();
  await shot(page, "01-login");

  await loginAs(page, "evacuation-coordinator");
  await page.getByTestId("generate-plan").click();
  await expect(page.getByText(/Plan v1 proposed/).first()).toBeVisible();

  // run the drill to ~T+50 so the map and KPIs are lively
  await page.goto("/drill");
  await page.getByRole("radio", { name: "16×" }).click();
  await page.getByTestId("drill-play").click();
  await expect(page.getByTestId("sim-clock")).toHaveText(/T\+(4[6-9]|[5-9]\d)/, { timeout: 60_000 });
  await page.getByTestId("drill-pause").click();
  await shot(page, "05-drill");

  await page.getByRole("link", { name: "Command Dashboard", exact: true }).click();
  await expect(page.getByText("People evacuated vs remaining")).toBeVisible();
  await shot(page, "02-dashboard");

  await page.getByRole("link", { name: "Allocation Plan", exact: true }).click();
  await page.getByRole("button", { name: /Compare strategies/ }).click();
  await expect(page.getByText("Strategy comparison")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "03b-strategy-comparison");
  await page.getByRole("button", { name: /Hide comparison/ }).click();
  await page.getByTestId("assignment-row").first().click();
  await expect(page.getByText("Alternatives considered")).toBeVisible();
  await shot(page, "03-plan-why-drawer");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Plan Versions", exact: true }).click();
  await page.getByTestId("version-item").filter({ hasText: "Route blocked" }).first().click();
  await shot(page, "04-plan-versions-diff");

  for (const [link, name] of [
    ["Zones", "06-zones"],
    ["Shelters", "06b-shelters"],
    ["Vehicles & Teams", "06c-fleet"],
    ["Routes", "06d-routes"],
    ["Architecture & FRs", "11-architecture"],
  ] as const) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, name);
  }

  await switchRole(page, "Incident Commander");
  await page.getByRole("link", { name: "Audit & Notifications", exact: true }).click();
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
  await shot(page, "10-audit-log");

  await switchRole(page, "Shelter Manager");
  await expect(page.getByTestId("live-occupancy")).toBeVisible();
  await page.getByLabel("Search name, household or phone").fill("Lakshmi");
  await page.waitForTimeout(800);
  await shot(page, "07-shelter-checkin");

  // light theme
  await switchRole(page, "Coordinator");
  await page.getByRole("button", { name: /Switch to light theme/ }).click();
  await page.goto("/");
  await expect(page.getByText("People evacuated vs remaining")).toBeVisible();
  await shot(page, "02b-dashboard-light");
  await page.getByRole("button", { name: /Switch to dark theme/ }).click();

  // mobile field view
  await switchRole(page, "Field Team");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("sync-status")).toBeVisible();
  await page.getByTestId("field-task").first().locator("button").first().click();
  await page.waitForTimeout(800);
  await shot(page, "08-field-mobile");

  await page.goto("/public");
  await page.getByRole("radio", { name: "हिन्दी" }).click();
  await page.getByRole("searchbox").or(page.locator("#lookup")).first().fill("98400 12345");
  await page.locator("form[role=search] button[type=submit]").click();
  await expect(page.getByTestId("public-result").first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/09-public-hindi-mobile.png`, fullPage: true });

  expect(errors, errors.join("\n")).toEqual([]);
});
