#!/usr/bin/env node
// Add social-sharing metadata (Open Graph / Twitter card tags) to every
// HTML page in the site, so shared links get a title, description and
// preview image. See site_meta.js for how the tags are derived.
//
// Run `node add_meta.js` after adding or editing hand-written pages.
// It is safe to re-run: the tags live between <!-- social meta -->
// markers and are regenerated in place. Posts built from markdown get
// their tags from build_thoughts.js, so they are skipped here.
//
// Pass file paths to update only those pages: `node add_meta.js toys/x.html`

const fs = require("fs");
const path = require("path");
const { injectMeta } = require("./site_meta");

const ROOT = __dirname;
const SKIP_DIRS = new Set([".git", "node_modules"]);

function findHtml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findHtml(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function main() {
  const files = process.argv.length > 2
    ? process.argv.slice(2).map((f) => path.resolve(f))
    : findHtml(ROOT);

  let changed = 0;
  for (const file of files.sort()) {
    const rel = path.relative(ROOT, file);
    if (fs.existsSync(file.replace(/\.html$/, ".md"))) continue; // built by build_thoughts.js
    const html = fs.readFileSync(file, "utf8");
    const updated = injectMeta(html, rel);
    if (updated === null) {
      console.log(`skipped (no <title>): ${rel}`);
    } else if (updated !== html) {
      fs.writeFileSync(file, updated);
      changed++;
    }
  }
  console.log(`updated ${changed} of ${files.length} pages`);
}

main();
