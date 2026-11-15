// Runs SafeRoute (5173) and god's-eye-view (4173) together. Ctrl+C stops both.
import { spawn } from "node:child_process";

const win = process.platform === "win32";
const procs = [
  spawn("npm", ["run", "dev"], { stdio: "inherit", shell: win }),
  spawn("node", ["scripts/gev.mjs"], { stdio: "inherit", shell: win }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", stop));
