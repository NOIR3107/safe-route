// Starts god's-eye-view (git submodule in ../integrations/gods-eye-view) so SafeRoute can embed it.
//   node scripts/gev.mjs           -> run it on http://localhost:4173
//   node scripts/gev.mjs install   -> npm install inside the submodule
// GEV refuses to be framed unless GEV_EMBED_FRAME_ANCESTORS names the page, so we allow the
// SafeRoute dev server here.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../integrations/gods-eye-view", import.meta.url));
if (!existsSync(`${dir}/package.json`)) {
  console.error("integrations/gods-eye-view is empty. Run: git submodule update --init");
  process.exit(1);
}

const install = process.argv[2] === "install";
const args = install ? ["install", "--no-audit", "--no-fund"] : ["run", "dev", "--", "--host", "localhost", "--port", "4173", "--strictPort"];
const env = {
  ...process.env,
  GEV_EMBED_FRAME_ANCESTORS: process.env.GEV_EMBED_FRAME_ANCESTORS ?? "http://localhost:5173 http://127.0.0.1:5173",
};
const child = spawn("npm", args, { cwd: dir, env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
