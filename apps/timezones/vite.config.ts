import { defineConfig } from "vite";

// timezones — compare times across timezones.
// Built as a self-contained static site. `base: '/'` produces absolute
// asset paths (/assets/..., /fonts/...). The Worker rewrites all
// timezones.muniee.com requests to /timezones/* in the assets directory, so
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
