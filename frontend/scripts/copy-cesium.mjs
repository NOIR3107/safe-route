// Copies CesiumJS's runtime files (web workers, images, CSS) into public/cesium so Vite serves them.
// Runs automatically before `npm run dev` and `npm run build`. public/cesium is git-ignored.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../node_modules/cesium/Build/Cesium/", import.meta.url));
const dest = fileURLToPath(new URL("../public/cesium/", import.meta.url));
const stamp = `${dest}.version`;
const version = JSON.parse(readFileSync(new URL("../node_modules/cesium/package.json", import.meta.url), "utf8")).version;

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);
for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) cpSync(`${src}${dir}`, `${dest}${dir}`, { recursive: true });
writeFileSync(stamp, version);
console.log(`Copied Cesium ${version} assets to public/cesium`);
