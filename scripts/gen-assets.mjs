#!/usr/bin/env node
// gen-assets.mjs — generate PNG social/manifest/touch icons from each site's SVG favicon.
//
// For each site (landing, sweep, timeformats, timezones, cron) produces:
//   <site>/og.png                 1200×630  social card (Open Graph + Twitter)
//   <site>/icon-192.png            192×192   manifest icon
//   <site>/icon-512.png            512×512   manifest icon
//   <site>/apple-touch-icon.png    180×180   apple-touch-icon
//
// Favicons are animated SVGs; we render the first/static frame (sharp uses librsvg
// which honours SMIL at t=0, i.e. the initial render state).
//
// Run: node scripts/gen-assets.mjs   (requires sharp, a transitive dep via vite)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");

const bg = "#0a0a0b"; // site dark background
const accent = "#b89dff"; // site accent (μ purple)

// SVG sources → output public/ dirs (the static assets shipped alongside the app).
// landing's static assets live in sites/landing/; each app's live in apps/<app>/public/.
// `name` is the site key (used in log lines); `wordmark` is what the card shows
// (landing's brand is "muniee", not "landing"); `host` is the URL line.
const sites = [
  { name: "landing",     wordmark: "muniee",       host: "muniee.com",             svg: join(projectRoot, "sites", "landing", "favicon.svg"),           out: join(projectRoot, "sites", "landing") },
  { name: "sweep",       wordmark: "sweep",        host: "sweep.muniee.com",       svg: join(projectRoot, "apps", "sweep", "public", "favicon.svg"),        out: join(projectRoot, "apps", "sweep", "public") },
  { name: "timeformats", wordmark: "timeformats",  host: "timeformats.muniee.com", svg: join(projectRoot, "apps", "timeformats", "public", "favicon.svg"), out: join(projectRoot, "apps", "timeformats", "public") },
  { name: "timezones",   wordmark: "timezones",    host: "timezones.muniee.com",   svg: join(projectRoot, "apps", "timezones", "public", "favicon.svg"),   out: join(projectRoot, "apps", "timezones", "public") },
  { name: "cron",        wordmark: "cron",         host: "cron.muniee.com",        svg: join(projectRoot, "apps", "cron", "public", "favicon.svg"),        out: join(projectRoot, "apps", "cron", "public") },
];

// Build a 1200×630 social card SVG. Left third = the app favicon blown up on the
// dark background; right two thirds = the brand wordmark + tagline in brand colour.
//
// `tagline` may be long; we wrap it across up to two lines at ~46 chars to stay
// within the right two-thirds (x≥640, max width ≈ 520px at font-size 30).
function wrapWords(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines.slice(0, 2); // cap at 2 lines
}

function cardSvg(site, faviconSvg) {
  const { wordmark, host } = site;
  const tagline = taglines[site.name];
  // strip the favicon's <svg> wrapper to get inner markup; we re-wrap at a larger viewBox.
  const inner = faviconSvg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    // drop the favicon's own background rect — the card provides its own
    .replace(/<rect[^>]*fill="#0a0a0b"[^>]*\/>/, "")
    .replace(/<style>.*?<\/style>/s, "");
  const lines = wrapWords(tagline, 30);
  const tagY0 = wordmark === "timeformats" ? 280 : 300; // longer wordmark sits a touch higher
  const tagSize = wordmark === "timeformats" ? 60 : (wordmark === "timezones" ? 72 : 96);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${bg}"/>
  <!-- app mark, centered in the left third -->
  <g transform="translate(80,95) scale(14.0625)">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      ${inner}
    </svg>
  </g>
  <!-- wordmark -->
  <text x="640" y="240" font-family="ui-monospace, SF Mono, Menlo, Consolas, monospace" font-size="${tagSize}" font-weight="700" fill="${accent}" text-anchor="start">${wordmark}</text>
  <text x="640" y="${tagY0}" font-family="ui-monospace, SF Mono, Menlo, Consolas, monospace" font-size="26" font-weight="400" fill="#c8c8d0" text-anchor="start">${lines[0] || ""}</text>
  ${lines[1] ? `<text x="640" y="${tagY0 + 38}" font-family="ui-monospace, SF Mono, Menlo, Consolas, monospace" font-size="26" font-weight="400" fill="#c8c8d0" text-anchor="start">${lines[1]}</text>` : ""}
  <text x="640" y="${tagY0 + (lines[1] ? 90 : 50)}" font-family="ui-monospace, SF Mono, Menlo, Consolas, monospace" font-size="24" font-weight="400" fill="#7a7a85" text-anchor="start">${host}</text>
</svg>`;
}

const taglines = {
  landing:     "μ means small. small client-side web tools.",
  sweep:       "batch QR scanner. camera, upload, base64.",
  timeformats: "convert time across 27 formats.",
  timezones:   "compare times across timezones.",
  cron:        "parse and visualize cron expressions.",
};

async function gen(site) {
  const favicon = await readFile(site.svg, "utf8");
  await mkdir(site.out, { recursive: true });

  // --- social card ---
  const card = Buffer.from(cardSvg(site, favicon));
  await sharp(card, { density: 144 })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(join(site.out, "og.png"));
  console.log(`✓ ${site.name}: og.png (1200×630)`);

  // --- manifest icons 192 + 512, rendered from the favicon at high density ---
  // Render the favicon SVG to a 1024 square (no extra background — the SVG has its own),
  // then downscale to 192 and 512 for crisp small icons.
  const big = Buffer.from(favicon);
  const bigBuf = await sharp(big, { density: 384 })
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(bigBuf).resize(192, 192, { fit: "contain" }).png().toFile(join(site.out, "icon-192.png"));
  await sharp(bigBuf).resize(512, 512, { fit: "contain" }).png().toFile(join(site.out, "icon-512.png"));
  console.log(`✓ ${site.name}: icon-192.png, icon-512.png`);

  // --- apple-touch-icon 180×180, opaque bg so iOS squircle looks right ---
  await sharp(bigBuf)
    .resize(180, 180, { fit: "contain", background: { r: 10, g: 10, b: 11, alpha: 1 } })
    .png()
    .toFile(join(site.out, "apple-touch-icon.png"));
  console.log(`✓ ${site.name}: apple-touch-icon.png (180×180)`);
}

for (const site of sites) {
  await gen(site).catch((e) => {
    console.error(`✗ ${site.name}: ${e.message}`);
    process.exitCode = 1;
  });
}
console.log("\n✓ PNG assets generated.");