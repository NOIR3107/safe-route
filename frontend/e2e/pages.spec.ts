/**
 * Every role, every page it can open, against the live backend. Fails on any console error and
 * saves one screenshot per page to docs/screenshots/<role>/ for the user manual (Exp 12).
 * Needs the backend on :8000 (seeded) and the dev server on :5173.
 */
import { expect, test } from "@playwright/test";
import { loginAs, trackConsole, type DemoRole } from "./helpers";

const ROLES: DemoRole[] = [
  "admin",
  "evacuation-coordinator",
  "emergency-authority",
  "shelter-manager",
  "transport-coordinator",
  "response-team",
  "relief-staff",
  "ngo-volunteer",
];

for (const role of ROLES) {
  test(`pages for ${role}`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackConsole(page);
    await loginAs(page, role);
    const links = await page.locator("nav a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      await page.goto(href);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText("Something on this page failed")).toHaveCount(0);
      await page.waitForTimeout(href === "/" || /zones|shelters|fleet|routes|drill|field/.test(href) ? 4000 : 800);
      const name = href === "/" ? "dashboard" : href.slice(1).replace(/\//g, "-");
      await page.screenshot({ path: `../docs/screenshots/${role}/${name}.png` });
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("public page works without login", async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto("/public");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});
