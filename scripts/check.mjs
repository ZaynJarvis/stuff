import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "artifacts.json"), "utf8"));
const artifacts = [...manifest.artifacts].sort((a, b) => {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return b.published.localeCompare(a.published) || a.title.localeCompare(b.title);
});
const required = ["dist/index.html", "dist/_headers", ...artifacts.map(({ slug }) => `dist/${slug}/index.html`)];

for (const path of required) {
  const file = resolve(root, path);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty output: ${path}`);
}

const index = await readFile(resolve(root, "dist/index.html"), "utf8");
const plan = await readFile(resolve(root, "dist/sd-plan/index.html"), "utf8");

if (index.includes("{{ARTIFACT_")) throw new Error("Index contains unreplaced template placeholders");
if (artifacts[0]?.slug !== "sd-plan" || !artifacts[0]?.pinned) throw new Error("SD Plan must remain the first pinned artifact");
for (const artifact of artifacts) {
  if (!index.includes(`href="/${artifact.slug}/"`)) throw new Error(`Index does not link to /${artifact.slug}/`);
  const detail = await readFile(resolve(root, `dist/${artifact.slug}/index.html`), "utf8");
  if (!detail.includes('href="/"')) throw new Error(`${artifact.slug} has no route back to the artifact list`);
  if (/\b(?:localhost|127\.0\.0\.1|file:\/\/)/i.test(detail)) throw new Error(`${artifact.slug} contains a local-only URL`);
}

const script = [...plan.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
if (!script) throw new Error("SD Plan script was not found");
new Function(script);

const accountsSource = script.match(/const accounts = (\[[\s\S]*?\n    \]);\n\n    const STORAGE_KEY/);
if (!accountsSource) throw new Error("SD Plan account data was not found");
const accounts = Function(`return ${accountsSource[1]}`)();
if (accounts.length !== 16) throw new Error(`Expected 16 SD Plan accounts, found ${accounts.length}`);

console.log(`Checks passed: ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}; index ↔ detail routes; 16 SD Plan accounts`);
