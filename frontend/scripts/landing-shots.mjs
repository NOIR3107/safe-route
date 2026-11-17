/**
 * Captures the real-app screenshots used on the landing page (public/landing/<name>-<theme>.jpg).
 * Needs the backend (seeded) on :8000 and the dev server on :5173. It generates and approves a plan
 * first, so reseed afterwards (`python -m app.seed` in backend/).
 *
 *   node scripts/landing-shots.mjs            # PW_CHROMIUM=/path/to/chrome to use another browser
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const WEB = "http://localhost:5173";
const API = "http://localhost:8000/api/v1";
const OUT = new URL("../public/landing/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function apiLogin(email, password) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { Authorization: `Bearer ${(await r.json()).access_token}`, "Content-Type": "application/json" };
}

// A plan on the map makes the dashboard meaningful.
const h = await apiLogin("coordinator@saferoute.org", "Coord@12345");
const plan = await (await fetch(`${API}/evacuations/generate`, { method: "POST", headers: h, body: JSON.stringify({ strategy: "min-cost-flow" }) })).json();
if (plan?.version) await fetch(`${API}/evacuations/versions/${plan.version}/approve`, { method: "POST", headers: h });

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function session(theme, role, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript((t) => {
    localStorage.setItem("saferoute-ui", JSON.stringify({ state: { theme: t, lang: "en", strategy: "min-cost-flow", navCollapsed: false, forceOffline: false }, version: 0 }));
  }, theme);
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`);
  await page.getByTestId(`demo-login-${role}`).click();
  await page.getByTestId("role-switcher").waitFor();
  return { ctx, page };
}

const shot = (page, name, theme) => page.screenshot({ path: `${OUT}${name}-${theme}.jpg`, type: "jpeg", quality: 80 });

for (const theme of ["dark", "light"]) {
  const desk = await session(theme, "evacuation-coordinator", { width: 1440, height: 900 });
  const p = desk.page;
  await p.goto(`${WEB}/app`);
  await p.waitForTimeout(8000);
  await shot(p, "dashboard", theme);

  await p.goto(`${WEB}/app/plan`);
  await p.getByTestId("assignment-row").first().click();
  await p.getByTestId("explanation-drawer").waitFor();
  await p.waitForTimeout(1500);
  await shot(p, "explain", theme);

  await p.goto(`${WEB}/app/drill`);
  await p.waitForTimeout(6000);
  await shot(p, "drill", theme);
  await desk.ctx.close();

  const phone = await session(theme, "response-team", { width: 390, height: 844 });
  await phone.page.goto(`${WEB}/app/field`);
  await phone.page.getByTestId("field-task").first().waitFor();
  await phone.page.waitForTimeout(1500);
  await shot(phone.page, "field", theme);
  await phone.ctx.close();
  console.log(`captured ${theme}`);
}
await browser.close();
