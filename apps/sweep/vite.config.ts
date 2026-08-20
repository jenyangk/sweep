import { defineConfig } from "vite";

// sweep — batch QR scanner.
// Built as a self-contained static site. `base: '/'` produces absolute
// asset paths (/assets/..., /fonts/...). The Worker rewrites all
// sweep.muniee.com requests to /sweep/* in the assets directory, so
// absolute paths resolve correctly at the subdomain root.
// Build output is pure static (HTML/CSS/JS). No framework, no SSR.
export default defineConfig({
  base: "/",
  build: {
    target: "esnext",
    outDir: "dist",
    assetsDir: "assets",
    modulePreload: { polyfill: false },
  },
  publicDir: "public",
});