import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = ["dist/index.html", "dist/sd-plan/index.html", "dist/_headers"];

for (const path of required) {
  const file = resolve(root, path);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty output: ${path}`);
}

const index = await readFile(resolve(root, "dist/index.html"), "utf8");
const plan = await readFile(resolve(root, "dist/sd-plan/index.html"), "utf8");

if (!index.includes('href="/sd-plan/"')) throw new Error("Index does not link to /sd-plan/");
if (!index.includes("HuaSheng Sales Development Plan")) throw new Error("SD Plan is not first in the artifact list");
if (!plan.includes('href="/"')) throw new Error("SD Plan has no route back to the artifact list");

const script = [...plan.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
if (!script) throw new Error("SD Plan script was not found");
new Function(script);

const accountsSource = script.match(/const accounts = (\[[\s\S]*?\n    \]);\n\n    const STORAGE_KEY/);
if (!accountsSource) throw new Error("SD Plan account data was not found");
const accounts = Function(`return ${accountsSource[1]}`)();
if (accounts.length !== 16) throw new Error(`Expected 16 SD Plan accounts, found ${accounts.length}`);

console.log("Checks passed: index → SD Plan → index; 16 accounts; valid detail script");
