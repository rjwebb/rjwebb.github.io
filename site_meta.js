// Social-sharing metadata (Open Graph + Twitter card) for site pages.
//
// injectMeta(html, relPath) derives the tags from the page itself:
//   title       <title>, minus the " | bobwebb.org" suffix
//   description first <p> in the page (or a site-wide default)
//   image       PAGE_IMAGES entry, else first raster <img> in the page
//   url         https://bobwebb.org/<relPath>
// and inserts them right after </title>, wrapped in marker comments so
// re-running replaces the block instead of duplicating it.
//
// Used by build_thoughts.js for generated posts and by add_meta.js for
// every other page.

const path = require("path");

const SITE_URL = "https://bobwebb.org";
const SITE_NAME = "bobwebb.org";
const DEFAULT_DESCRIPTION = "Bob Webb's personal website.";
const START = "<!-- social meta -->";
const END = "<!-- /social meta -->";
const MAX_DESCRIPTION = 200;
const MIN_PARAGRAPH = 40; // shorter <p>s (addresses, link labels) make poor descriptions

// Fallback descriptions for sections whose pages have no usable paragraph.
const SECTION_DESCRIPTIONS = {
  html_day_2025: "A tour of my home, as a website. Made for HTML Day 2025.",
  ubuwiki: "A wiki of notes and sources on concrete poetry, sound poetry and experimental writing.",
};

// Share images chosen by hand, keyed by page path (relative to the site
// root). These win over the first <img> on the page.
const PAGE_IMAGES = {
  "index.html": "images/teaser.png",
};

// <p> classes that hold page furniture rather than prose.
const SKIP_PARAGRAPH = /class=["'][^"']*\b(src-meta|loc|hint)\b/;

function escapeAttr(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function textOf(html) {
  const inline = /<\/?(a|abbr|b|cite|code|em|i|q|small|span|strong|sub|sup|u)\b[^>]*>/gi;
  return decodeEntities(html.replace(inline, "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "") + "…";
}

function pageUrl(relPath) {
  const p = relPath.split(path.sep).join("/");
  if (p === "index.html") return `${SITE_URL}/`;
  if (p.endsWith("/index.html")) return `${SITE_URL}/${p.slice(0, -"index.html".length)}`;
  return `${SITE_URL}/${p}`;
}

function absoluteUrl(src, relPath) {
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith("/")) return SITE_URL + src;
  const base = pageUrl(relPath.split(path.sep).join("/").replace(/[^/]*$/, ""));
  return encodeURI(decodeURI(new URL(src, base).href));
}

// For list-style posts: "<intro paragraph> item; item; item…"
function listSummary(body) {
  const list = /<(ul|ol)[\s>]/i.exec(body);
  if (!list) return "";
  const intro = /<p[\s>][\s\S]*?<\/p>/i.exec(body.slice(0, list.index));
  const items = [];
  const liRe = /<li[^>]*>([\s\S]*?)(?=<\/?(?:li|ul|ol|details)[\s>])/gi;
  let m;
  while ((m = liRe.exec(body.slice(list.index))) !== null && items.length < 12) {
    const text = textOf(m[1]);
    if (text) items.push(text);
  }
  if (items.length === 0) return "";
  return [intro ? textOf(intro[0]) : "", items.join("; ")].filter(Boolean).join(" ");
}

function extract(html, relPath) {
  const withoutBlock = removeMeta(html);
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(withoutBlock);
  const title = titleMatch
    ? textOf(titleMatch[1]).replace(/\s*\|\s*(bobwebb\.org|rjwebb\.github\.io)$/, "")
    : path.basename(relPath, ".html");

  const bodyStart = withoutBlock.search(/<body[\s>]/i);
  const body = bodyStart === -1 ? withoutBlock : withoutBlock.slice(bodyStart);
  // skip <script>/<style> content so code never ends up in a description
  const visible = body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");

  // a hand-written <meta name="description"> wins over the first paragraph
  const existing = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(withoutBlock);
  let description = existing ? decodeEntities(existing[1]).trim() : "";
  const paraRe = /<p[\s>][\s\S]*?<\/p>/gi;
  let m;
  while (!description && (m = paraRe.exec(visible)) !== null) {
    const text = textOf(m[0]);
    if (!SKIP_PARAGRAPH.test(m[0].slice(0, m[0].indexOf(">"))) && text.length >= MIN_PARAGRAPH) {
      description = text;
    }
  }
  const section = relPath.split(/[\\/]/)[0];
  description = truncate(
    description || SECTION_DESCRIPTIONS[section] || listSummary(visible) || DEFAULT_DESCRIPTION,
    MAX_DESCRIPTION
  );

  const chosen = PAGE_IMAGES[relPath.split(path.sep).join("/")];
  let image = chosen ? `${SITE_URL}/${encodeURI(chosen)}` : null;
  const imgRe = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  while (!image && (m = imgRe.exec(visible)) !== null) {
    // social cards don't render SVG
    if (!/\.svg(\?|#|$)/i.test(m[1]) && !m[1].startsWith("data:")) {
      image = absoluteUrl(m[1], relPath);
    }
  }

  const hasDescription = Boolean(existing);
  const type = /^thoughts[\\/]/.test(relPath) ? "article" : "website";
  return { title, description, image, url: pageUrl(relPath), type, hasDescription };
}

function metaBlock({ title, description, image, url, type, hasDescription }, indent) {
  const tags = [];
  if (!hasDescription) tags.push(["name", "description", description]);
  tags.push(
    ["property", "og:type", type],
    ["property", "og:site_name", SITE_NAME],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url]
  );
  if (image) tags.push(["property", "og:image", image]);
  tags.push(
    ["name", "twitter:card", image ? "summary_large_image" : "summary"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description]
  );
  if (image) tags.push(["name", "twitter:image", image]);

  return [
    START,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`),
    END,
  ]
    .map((line) => indent + line)
    .join("\n");
}

function removeMeta(html) {
  const re = new RegExp(`[ \\t]*${START}[\\s\\S]*?${END}[ \\t]*\\n?`, "g");
  return html.replace(re, "");
}

// Returns html with a fresh metadata block, or null if the page has no
// <title> to anchor it to.
function injectMeta(html, relPath) {
  const meta = extract(html, relPath);
  const clean = removeMeta(html);
  const m = /^([ \t]*)<title[^>]*>[\s\S]*?<\/title>[^\n]*\n?/im.exec(clean);
  if (!m) return null;
  const at = m.index + m[0].length;
  const sep = m[0].endsWith("\n") ? "" : "\n";
  return clean.slice(0, at) + sep + metaBlock(meta, m[1]) + "\n" + clean.slice(at);
}

module.exports = { injectMeta, SITE_URL };
