// God's Eye View integration. Needs god's-eye-view running (`npm run gev`); skipped otherwise.
import { expect, test } from "@playwright/test";
import { loginAs, trackConsole } from "./helpers";

test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

test("embeds god's-eye-view and drives its camera", async ({ page, request }) => {
  const up = await request.get("http://localhost:4173/?embed=1").then((r) => r.ok()).catch(() => false);
  test.skip(!up, "god's-eye-view is not running on :4173");
  test.setTimeout(120_000);

  const errors = trackConsole(page);
  await loginAs(page, "evacuation-coordinator");
  await page.getByTestId("generate-plan").click();
  await expect(page.getByText(/Plan v1 proposed/).first()).toBeVisible();

  await page.getByRole("link", { name: "God's Eye View (3D)", exact: true }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 60_000 });

  // The first view (overview + overlay) is sent automatically once GEV is ready.
  await expect(page.getByText("View applied")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /Velachery/ }).click();
  await page.waitForTimeout(9_000); // camera flight + imagery
  await page.screenshot({ path: "../docs/screenshots/12-gods-eye-view.png" });

  // Our own page must not log errors; GEV's console lives in the iframe and is not counted here.
  expect(errors, errors.join("\n")).toEqual([]);
});
