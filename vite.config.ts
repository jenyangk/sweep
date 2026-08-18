import { defineConfig } from "vite";

// sweep — static site for GitHub Pages.
// Build output is pure static (HTML/CSS/JS). No framework, no SSR.
// A 404.html is copied from index.html so client routing never hard-404s.
export default defineConfig({
  build: {
    target: "esnext",
    outDir: "dist",
    assetsDir: "assets",
    modulePreload: { polyfill: false },
  },
  publicDir: "public",
});