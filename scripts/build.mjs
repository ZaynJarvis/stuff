import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "site");
const destination = resolve(root, "dist");
const manifestPath = resolve(root, "artifacts.json");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (date) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`));

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schema_version !== 1 || !Array.isArray(manifest.artifacts)) {
  throw new Error("artifacts.json must use schema_version 1 and contain an artifacts array");
}

const slugs = new Set();
for (const artifact of manifest.artifacts) {
  for (const field of ["slug", "title", "summary", "category", "kind", "published", "format", "language"]) {
    if (typeof artifact[field] !== "string" || !artifact[field].trim()) {
      throw new Error(`Artifact ${artifact.slug || "<unknown>"} is missing ${field}`);
    }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artifact.slug)) {
    throw new Error(`Invalid artifact slug: ${artifact.slug}`);
  }
  if (slugs.has(artifact.slug)) throw new Error(`Duplicate artifact slug: ${artifact.slug}`);
  slugs.add(artifact.slug);
  const detail = join(source, artifact.slug, "index.html");
  if (!(await stat(detail)).isFile()) throw new Error(`Missing detail page: site/${artifact.slug}/index.html`);
}

const artifacts = [...manifest.artifacts].sort((a, b) => {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return b.published.localeCompare(a.published) || a.title.localeCompare(b.title);
});

const artifactList = artifacts.map((artifact, index) => `
        <li class="artifact">
          <a class="artifact-link" href="/${escapeHtml(artifact.slug)}/">
            <span class="artifact-index">${String(index + 1).padStart(3, "0")}</span>
            <div class="artifact-copy">
              <div class="artifact-type">${escapeHtml(artifact.category)} · ${escapeHtml(artifact.kind)}</div>
              <h2 class="artifact-title">${escapeHtml(artifact.title)}</h2>
              <p class="artifact-summary">${escapeHtml(artifact.summary)}</p>
            </div>
            <dl class="artifact-facts">
              <div><dt>Published</dt><dd>${escapeHtml(formatDate(artifact.published))}</dd></div>
              <div><dt>Format</dt><dd>${escapeHtml(artifact.format)}</dd></div>
              <div><dt>Language</dt><dd>${escapeHtml(artifact.language)}</dd></div>
            </dl>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
        </li>`).join("");

const template = await readFile(join(source, "index.template.html"), "utf8");
if (!template.includes("{{ARTIFACT_COUNT}}") || !template.includes("{{ARTIFACT_LIST}}")) {
  throw new Error("Index template is missing artifact placeholders");
}
const index = template
  .replace("{{ARTIFACT_COUNT}}", `${artifacts.length} ${artifacts.length === 1 ? "item" : "items"}`)
  .replace("{{ARTIFACT_LIST}}", artifactList);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (path) => !path.endsWith("index.template.html"),
});
await writeFile(join(destination, "index.html"), index);

console.log(`Built ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} into dist/`);
