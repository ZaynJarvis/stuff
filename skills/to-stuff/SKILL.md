---
name: to-stuff
description: Publish a finished, standalone HTML artifact to the public Stuff repository and stuff.zaynjarvis.com. Use when the user invokes /to-stuff or asks to add, upload, publish, or update a mature HTML artifact in ZaynJarvis/stuff with automatic GitHub-to-Cloudflare deployment.
---

# Publish to Stuff

Publish one self-contained HTML artifact to `https://stuff.zaynjarvis.com/<slug>/`, register it in the artifact index, push `main`, and verify the Cloudflare deployment.

## Inputs

Require an HTML file path. Infer sensible metadata from the artifact, but ask when title, public summary, or slug is genuinely ambiguous.

- `title`: public display title
- `slug`: lowercase URL segment; derive from the title when safe
- `summary`: one concrete public sentence
- `category`: short category, such as `Sales development`
- `kind`: artifact type, such as `Research report`
- `published`: `YYYY-MM-DD`; default to today
- `language`: infer `English`, `中文`, or `中文 / English`

## Workflow

1. **Inspect the artifact.** Confirm that it is finished, standalone, and suitable for a public URL. Preserve its design and behavior.
2. **Run the public-safety gate.** Search for secrets, private/internal claims, local paths, `localhost`, `file://`, `noindex`, and missing assets. Stop on secrets or broken local dependencies. Surface internal/confidential wording before publishing; do not silently delete facts.
3. **Sync the repository.** Use `${STUFF_REPO:-$HOME/code/stuff}`. If absent, run `gh repo clone ZaynJarvis/stuff "$HOME/code/stuff"`. Require GitHub authentication. Inspect `git status`; do not overwrite or stage unrelated changes. On a clean tree, run `git pull --ff-only`.
4. **Prepare the entry.** Resolve `SKILL_DIR` as the directory containing this `SKILL.md`, then run:

   ```bash
   node "$SKILL_DIR/scripts/prepare-artifact.mjs" \
     --file /absolute/path/artifact.html \
     --title "Public title" \
     --slug "public-slug" \
     --summary "One concrete sentence." \
     --category "Category" \
     --kind "Artifact type" \
     --published "YYYY-MM-DD" \
     --language "中文 / English" \
     --confirm-public
   ```

   Use `--replace` only when the user asks to update an existing slug. Use `--pin` only when the user explicitly wants the item above the pinned SD Plan.
5. **Validate.** In the repository run `npm run build && npm run check`. Inspect the generated `dist/index.html` and `dist/<slug>/index.html`. Verify the list links to the detail page and the detail page links back to `/`.
6. **Publish.** The explicit `/to-stuff` request authorizes a direct content commit to `main` after validation. Stage only `artifacts.json` and `site/<slug>/index.html`. Commit as `publish <slug> artifact`, then push. If push is rejected, rebase only on a clean, fully understood tree, rerun checks, and push again.
7. **Verify production.** Confirm local and remote commit hashes match. Poll both `https://stuff.zaynjarvis.com/` and `https://stuff.zaynjarvis.com/<slug>/` for up to two minutes. The root must contain the title; the detail route must return HTTP 200. Use a query such as `?v=<commit>` to avoid stale cache.
8. **Report.** Return the public detail URL, index URL, GitHub commit, and validation result. State any unverified gap plainly.

## Guardrails

- Publish standalone `.html` files only. Do not leave local CSS, JS, font, or image dependencies behind.
- Never commit credentials, private keys, tokens, customer-confidential content, or hidden local files.
- Do not change factual claims while making a page public.
- Do not deploy when the repository has unrelated changes or validation fails.
- Keep `sd-plan` pinned first unless the user explicitly changes the order.
- Treat a successful push as incomplete until the public detail URL returns the new content.
