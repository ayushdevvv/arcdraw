import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(
  scriptDir,
  "../node_modules/@excalidraw/excalidraw/dist/prod/fonts"
);
const destination = path.resolve(scriptDir, "../public/fonts");

if (!fs.existsSync(source)) {
  console.warn("[arcdraw] Excalidraw fonts were not found in frontend/node_modules. Run npm install inside frontend/.");
  process.exit(0);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });
console.log("[arcdraw] Self-hosted Excalidraw fonts copied into frontend/public/fonts.");
