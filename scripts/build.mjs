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
  if (artifact.slug === "z") throw new Error("Artifact slug z is reserved for the hidden index route");
  if (slugs.has(artifact.slug)) throw new Error(`Duplicate artifact slug: ${artifact.slug}`);
  slugs.add(artifact.slug);
  const detail = join(source, artifact.slug, "index.html");
  if (!(await stat(detail)).isFile()) throw new Error(`Missing detail page: site/${artifact.slug}/index.html`);
}

const artifacts = [...manifest.artifacts].sort((a, b) => {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return b.published.localeCompare(a.published) || a.title.localeCompare(b.title);
});

const presentation = [
  {
    id: "find-customers",
    title: "正在找客户",
    summary: "客户计划和潜客调研，里面有账户、触发事件和下一步。",
    navTitle: "我正在找客户",
    navSummary: "账户、触发事件和外联路径",
    order: ["sd-plan", "cube-construction-outreach-radar-2026"],
  },
  {
    id: "build-business",
    title: "正在做产品和生意",
    summary: "从客户访谈、定位和销售，一路读到经营数字与个人商业。",
    navTitle: "我在做产品和生意",
    navSummary: "访谈、定位、销售、财务与个人商业",
    order: ["mom-test", "obviously-awesome", "founding-sales", "financial-intelligence", "zhen-benshi"],
  },
  {
    id: "understand-systems",
    title: "正在理解 AI 系统",
    summary: "先看 OpenViking 怎么组织上下文，再沿源码看请求如何流动。",
    navTitle: "我想看懂 AI 系统",
    navSummary: "先看系统思想，再追源码路径",
    order: ["openviking-context-atlas", "openviking-explained"],
  },
  {
    id: "learn-lighting",
    title: "正在学人像打光",
    summary: "用同一张比熊犬照片比较十种经典人像光法：看光位、适用场景和效果。",
    navTitle: "我想学人像打光",
    navSummary: "同一张照片，比较十种人像光法",
    order: ["portrait-lighting-atlas"],
  },

  {
    id: "try-prototypes",
    title: "正在做产品原型",
    summary: "吃了吗：不打分、用「A ⟩ B」两两比较排位的新加坡社交美食 App，可直接上手玩。",
    navTitle: "我在做产品原型",
    navSummary: "可以直接上手玩的产品 PoC",
    order: ["chi-le-ma"],
  },
];

const businessCategories = new Set(["创业与客户访谈", "产品定位", "创始人销售", "创业财务", "职业与个人商业"]);

const shelfForArtifact = (artifact) => {
  if (["Architecture", "AI agents"].includes(artifact.category)) return "understand-systems";
  if (artifact.category === "摄影教学") return "learn-lighting";
  if (/research|调研/i.test(artifact.kind)) return "find-customers";
  if (businessCategories.has(artifact.category)) return "build-business";
  if (artifact.category === "产品原型") return "try-prototypes";
  throw new Error(`No homepage shelf configured for ${artifact.slug} (${artifact.category} / ${artifact.kind})`);
};

const orderArtifacts = (items, preferred) => [...items].sort((a, b) => {
  const aIndex = preferred.indexOf(a.slug);
  const bIndex = preferred.indexOf(b.slug);
  if (aIndex !== -1 || bIndex !== -1) {
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  }
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return b.published.localeCompare(a.published) || a.title.localeCompare(b.title);
});

const cardBadge = (artifact) => {
  if (artifact.pinned) return "置顶";
  if (artifact.slug === "openviking-context-atlas") return "先看";
  if (artifact.slug === "openviking-explained") return "再看";
  return artifact.category;
};

const renderArtifact = (artifact) => `
          <li class="artifact${artifact.pinned ? " artifact-pinned" : ""}">
            <a class="artifact-link" href="/${escapeHtml(artifact.slug)}/" aria-label="打开：${escapeHtml(artifact.title)}">
              <div class="artifact-meta">
                <span>${escapeHtml(cardBadge(artifact))}</span>
                ${artifact.pinned ? `<span class="artifact-topic">${escapeHtml(artifact.category)}</span>` : ""}
              </div>
              <h3 class="artifact-title">${escapeHtml(artifact.title)}</h3>
              <p class="artifact-summary">${escapeHtml(artifact.summary)}</p>
              <span class="artifact-open">打开作品 <span aria-hidden="true">↗</span></span>
            </a>
          </li>`;

const shelves = presentation.map((shelf) => {
  const items = orderArtifacts(
    artifacts.filter((artifact) => shelfForArtifact(artifact) === shelf.id),
    shelf.order,
  );
  if (!items.length) return null;
  return { ...shelf, items };
}).filter(Boolean);

const shelfNav = shelves.map((shelf) => `
          <a class="path-link" href="#${shelf.id}">
            <span class="path-count">${shelf.items.length}</span>
            <span><strong>${shelf.navTitle}</strong><small>${shelf.navSummary}</small></span>
            <span class="path-arrow" aria-hidden="true">↓</span>
          </a>`).join("");

const artifactSections = shelves.map((shelf) => `
      <section class="shelf-section${shelf.items.length === 1 ? " shelf-single" : ""}" id="${shelf.id}" aria-labelledby="${shelf.id}-title">
        <header class="section-head">
          <div>
            <h2 id="${shelf.id}-title">${shelf.title}</h2>
          </div>
          <p>${shelf.summary}</p>
        </header>
        <ol class="artifact-grid" aria-label="${shelf.title}">
${shelf.items.map(renderArtifact).join("\n")}
        </ol>
      </section>`).join("\n");

const template = await readFile(join(source, "index.template.html"), "utf8");
if (!template.includes("{{ARTIFACT_COUNT}}")
    || !template.includes("{{SHELF_NAV}}")
    || !template.includes("{{ARTIFACT_SECTIONS}}")) {
  throw new Error("Index template is missing artifact placeholders");
}
const index = template
  .replaceAll("{{ARTIFACT_COUNT}}", String(artifacts.length))
  .replace("{{SHELF_NAV}}", shelfNav)
  .replace("{{ARTIFACT_SECTIONS}}", artifactSections);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (path) => !path.endsWith("index.template.html"),
});
await mkdir(join(destination, "z"), { recursive: true });
await writeFile(join(destination, "z", "index.html"), index);

console.log(`Built ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} into dist/`);
