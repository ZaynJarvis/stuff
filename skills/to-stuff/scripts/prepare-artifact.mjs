#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { homedir } from "node:os";

function usage() {
  console.log(`Usage:
  prepare-artifact.mjs --file FILE --title TITLE --summary SUMMARY [options]

Options:
  --repo DIR          Stuff repository (default: $STUFF_REPO or ~/code/stuff)
  --slug SLUG         URL slug; derived from title when omitted
  --category TEXT     Index category (default: Artifact)
  --kind TEXT         Artifact kind (default: Published HTML)
  --published DATE    YYYY-MM-DD (default: today)
  --format TEXT       Display format (default: Interactive HTML)
  --language TEXT     Display language; inferred when omitted
  --pin               Pin above unpinned artifacts
  --replace           Replace an existing slug
  --confirm-public    Required acknowledgement for public publishing
  --dry-run           Validate and report without writing
  --help              Show this help`);
}

function parseArgs(argv) {
  const options = {
    repo: process.env.STUFF_REPO || join(homedir(), "code", "stuff"),
    category: "Artifact",
    kind: "Published HTML",
    published: new Date().toISOString().slice(0, 10),
    format: "Interactive HTML",
    pin: false,
    replace: false,
    confirmPublic: false,
    dryRun: false,
  };
  const names = new Map([
    ["--file", "file"], ["--repo", "repo"], ["--title", "title"],
    ["--slug", "slug"], ["--summary", "summary"], ["--category", "category"],
    ["--kind", "kind"], ["--published", "published"], ["--format", "format"],
    ["--language", "language"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") options.help = true;
    else if (arg === "--pin") options.pin = true;
    else if (arg === "--replace") options.replace = true;
    else if (arg === "--confirm-public") options.confirmPublic = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (names.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[names.get(arg)] = value;
      index += 1;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferLanguage(html) {
  const hasChinese = /[\u3400-\u9fff]/.test(html);
  const hasEnglish = /\b(?:the|and|with|from|for|this|that)\b/i.test(html);
  if (hasChinese && hasEnglish) return "中文 / English";
  if (hasChinese) return "中文";
  return "English";
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function inspectHtml(html) {
  const errors = [];
  const warnings = [];
  if (!/^\s*<!doctype html>/i.test(html) || !/<html\b/i.test(html) || !/<head\b/i.test(html) || !/<body\b/i.test(html)) {
    errors.push("The source must be a complete HTML document with doctype, html, head, and body");
  }
  if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)
      || /<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots/i.test(html)) {
    errors.push("The artifact contains a noindex robots directive");
  }

  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bCLOUDFLARE_API_TOKEN\s*=\s*[^\s<]+/i,
  ];
  if (secretPatterns.some((pattern) => pattern.test(html))) errors.push("The artifact appears to contain a credential or private key");

  const resourcePattern = /<(?:script|img|link|source|video|audio)\b[^>]*(?:src|href|poster)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(resourcePattern)) {
    const reference = match[1].trim();
    if (!/^(?:https?:|data:|\/\/)/i.test(reference)) {
      errors.push(`Local resource dependency is not publishable as one HTML file: ${reference}`);
    }
  }
  const htmlWithoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const match of htmlWithoutScripts.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const reference = match[1].trim();
    if (!/^(?:https?:|data:|#)/i.test(reference)) {
      errors.push(`Local CSS resource dependency is not publishable as one HTML file: ${reference}`);
    }
  }

  if (/\b(?:localhost|127\.0\.0\.1|file:\/\/)/i.test(html)) errors.push("Contains a local-only URL or hostname");
  if (/<a\b[^>]*\bhref\s*=\s*["']\/["'][^>]*>/i.test(html)) {
    errors.push("Artifact pages are standalone destinations and must not link back to the Stuff index");
  }
  if (/\b(?:internal review|confidential|do not distribute)\b|内部审阅|机密|请勿外传/i.test(html)) {
    warnings.push("Contains internal or confidential wording; review it before publishing");
  }
  if (/\blorem ipsum\b/i.test(html) || /\b(?:TODO|PLACEHOLDER)\b/.test(html)) {
    warnings.push("Contains placeholder or unfinished-copy markers");
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function makePublic(html, { title, slug }) {
  const canonical = `https://stuff.zaynjarvis.com/${slug}/`;
  const canonicalTag = `<link rel="canonical" href="${canonical}" />`;
  const ogUrlTag = `<meta property="og:url" content="${canonical}" />`;
  const additions = [];

  if (/<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
    html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, canonicalTag);
  } else additions.push(canonicalTag);

  if (/<meta\b[^>]*property=["']og:url["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta\b[^>]*property=["']og:url["'][^>]*>/i, ogUrlTag);
  } else additions.push(ogUrlTag);

  if (!/<title>[^<]*<\/title>/i.test(html)) additions.push(`<title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title>`);
  if (additions.length) html = html.replace(/<\/head>/i, `  ${additions.join("\n  ")}\n</head>`);

  return html;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  for (const field of ["file", "title", "summary"]) {
    if (!options[field]?.trim()) throw new Error(`--${field} is required`);
  }
  if (!options.confirmPublic) throw new Error("--confirm-public is required because this publishes to a public website");
  if (!isIsoDate(options.published)) {
    throw new Error("--published must be a valid YYYY-MM-DD date");
  }

  const input = resolve(options.file);
  const repo = resolve(options.repo);
  const manifestPath = join(repo, "artifacts.json");
  const slug = options.slug || slugify(options.title);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Provide a lowercase hyphenated --slug");
  if (extname(input).toLowerCase() !== ".html") throw new Error("Only .html artifacts are supported");
  await access(input, constants.R_OK);
  await access(manifestPath, constants.R_OK | constants.W_OK);

  let html = await readFile(input, "utf8");
  const inspection = inspectHtml(html);
  if (inspection.errors.length) throw new Error(inspection.errors.join("\n"));
  html = makePublic(html, { title: options.title, slug });

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.artifacts)) throw new Error("Unsupported artifacts.json schema");
  const existingIndex = manifest.artifacts.findIndex((artifact) => artifact.slug === slug);
  if (existingIndex >= 0 && !options.replace) throw new Error(`Slug already exists: ${slug}; use --replace only for an intentional update`);

  const artifact = {
    slug,
    title: options.title.trim(),
    summary: options.summary.trim(),
    category: options.category.trim(),
    kind: options.kind.trim(),
    published: options.published,
    format: options.format.trim(),
    language: options.language?.trim() || inferLanguage(html),
    pinned: options.pin || (existingIndex >= 0 && Boolean(manifest.artifacts[existingIndex].pinned)),
  };
  if (existingIndex >= 0) manifest.artifacts[existingIndex] = artifact;
  else manifest.artifacts.push(artifact);

  const destination = join(repo, "site", slug, "index.html");
  const report = {
    slug,
    route: `/${slug}/`,
    destination,
    manifest: manifestPath,
    replaced: existingIndex >= 0,
    warnings: inspection.warnings,
    dry_run: options.dryRun,
  };

  if (!options.dryRun) {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, html.endsWith("\n") ? html : `${html}\n`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  for (const warning of inspection.warnings) console.error(`Warning: ${warning}`);
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(`to-stuff: ${error.message}`);
  process.exitCode = 1;
});
