#!/usr/bin/env node
// assemble.mjs — assemble the single Worker assets directory (public/) from
// built app output and landing source files.
//
//   public/landing/       ← sites/landing/           (static source, copied as-is)
//   public/sweep/         ← apps/sweep/dist/         (vite build output)
//   public/timeformats/   ← apps/timeformats/dist/   (vite build output)
//   public/timezones/     ← apps/timezones/dist/     (vite build output)
//   public/cron/          ← apps/cron/dist/          (vite build output)
//
// Run after `npm run build:apps`.

import { cp, mkdir, rm, readdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");
const publicDir = join(projectRoot, "public");
const landingSrc = join(projectRoot, "sites", "landing");

const apps = [
  { name: "sweep", dist: join(projectRoot, "apps", "sweep", "dist") },
  { name: "timeformats", dist: join(projectRoot, "apps", "timeformats", "dist") },
  { name: "timezones", dist: join(projectRoot, "apps", "timezones", "dist") },
  { name: "cron", dist: join(projectRoot, "apps", "cron", "dist") },
];

async function exists(p) {
  try {
    await readdir(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // Verify landing source exists.
  if (!(await exists(landingSrc))) {
    console.error("✗ landing source not found at sites/landing/");
    process.exit(1);
  }

  // Verify all app builds exist.
  for (const app of apps) {
    if (!(await exists(app.dist))) {
      console.error(`✗ ${app.name} build output not found at apps/${app.name}/dist/`);
      console.error(`  Run \`npm run build:${app.name}\` first.`);
      process.exit(1);
    }
  }

  // Clean and recreate public/.
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });

  // Copy landing source → public/landing/
  await cp(landingSrc, join(publicDir, "landing"), { recursive: true });
  console.log("✓ copied sites/landing/ → public/landing/");

  // Copy each app build output → public/<app>/
  for (const app of apps) {
    await cp(app.dist, join(publicDir, app.name), { recursive: true });
    console.log(`✓ copied apps/${app.name}/dist/ → public/${app.name}/`);

    // Copy index.html as 404.html so missing paths get a styled 404.
    // The Worker uses not_found_handling = "404-page".
    try {
      await copyFile(
        join(publicDir, app.name, "index.html"),
        join(publicDir, app.name, "404.html"),
      );
      console.log(`✓ created public/${app.name}/404.html (copy of index.html)`);
    } catch {
      // Non-fatal — 404-page handling will fall back to the nearest 404.html.
    }
  }

  // Create a 404.html for the landing site if one doesn't exist.
  if (!(await exists(join(publicDir, "landing", "404.html")))) {
    // The landing index.html works as a soft 404 for the root site.
    await copyFile(
      join(publicDir, "landing", "index.html"),
      join(publicDir, "landing", "404.html"),
    );
    console.log("✓ created public/landing/404.html (copy of index.html)");
  }

  // .assetsignore — exclude nothing extra (public/ is freshly assembled).
  // Included for explicitness; Cloudflare reads this from the assets directory root.
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    join(publicDir, ".assetsignore"),
    "# Auto-generated. public/ is freshly assembled by scripts/assemble.mjs.\n",
  );

  console.log("\n✓ public/ assembled. Ready for wrangler dev or wrangler deploy.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});