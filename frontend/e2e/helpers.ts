import { expect, type Page } from "@playwright/test";

/** Collects console errors and page errors; map-tile network failures are ignored (offline CI). */
export function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/tile\.openstreetmap\.org|Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export async function loginAs(page: Page, role: "evacuation-coordinator" | "emergency-authority" | "shelter-manager" | "response-team" | "transport-coordinator" | "admin") {
  await page.goto("/login");
  await page.getByTestId(`demo-login-${role}`).click();
  await expect(page.getByTestId("role-switcher")).toBeVisible();
}

export async function switchRole(page: Page, label: string) {
  await page.getByTestId("role-switcher").click();
  await page.getByRole("menuitem", { name: new RegExp(`^${label}`, "i") }).click();
  await expect(page.getByTestId("role-switcher")).toContainText(label);
}
