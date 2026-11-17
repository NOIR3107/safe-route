import { expect, type Page } from "@playwright/test";

/** Collects console errors and page errors; basemap tile failures are ignored (offline CI). */
export function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/arcgisonline|server\.arcgis|Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export type DemoRole =
  | "admin"
  | "evacuation-coordinator"
  | "emergency-authority"
  | "shelter-manager"
  | "transport-coordinator"
  | "response-team"
  | "relief-staff"
  | "ngo-volunteer";

/** Signs in with one of the seeded lab accounts listed on the login page. */
export async function loginAs(page: Page, role: DemoRole) {
  await page.goto("/login");
  await page.getByTestId(`demo-login-${role}`).click();
  await expect(page.getByTestId("role-switcher")).toBeVisible();
}
