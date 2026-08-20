#!/usr/bin/env node
// clean.mjs — remove build artifacts.
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");

const targets = [
  join(projectRoot, "public"),
  join(projectRoot, "apps", "sweep", "dist"),
  join(projectRoot, ".wrangler"),
];

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
  console.log(`✓ removed ${target}`);
}

console.log("\n✓ clean.");