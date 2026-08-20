// muniee — Cloudflare Worker: host-based routing for a multi-site static-assets deployment.
//
// Assets layout (single assets dir, per Cloudflare's one-dir-per-Worker limit):
//   public/
//     landing/       ← muniee.com landing page
//     sweep/         ← sweep.muniee.com QR scanner app
//     timeformats/   ← timeformats.muniee.com time format converter
//     timezones/     ← timezones.muniee.com timezone converter
//     cron/          ← cron.muniee.com cron expression visualizer
//
// Routing: the Worker runs first on every request (run_worker_first: true),
// inspects the hostname, and prefixes the pathname with the matching subdir
// before handing the request to the ASSETS binding. The ASSETS binding
// ignores the hostname — only the pathname matters.
//
//   sweep.muniee.com/*         → /sweep/*
//   timeformats.muniee.com/*    → /timeformats/*
//   timezones.muniee.com/*      → /timezones/*
//   cron.muniee.com/*           → /cron/*
//   everything else             → /landing/*
//
// Each app is built with Vite `base: '/'` so absolute asset paths (/assets/...,
// /fonts/...) resolve correctly at the subdomain root after rewriting.

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Prefer the Host header (authoritative in production, and the only way
    // to get the requested hostname in local dev where request.url points
    // at 127.0.0.1). Fall back to the URL hostname if absent.
    const host = (request.headers.get("host") ?? url.hostname).toLowerCase();

    // Route by hostname. Each app gets its own subdomain; everything else
    // (muniee.com, *.workers.dev, localhost, 127.0.0.1) falls through to
    // the landing page.
    let prefix: string;
    if (host === "sweep.muniee.com" || host.endsWith(".sweep.muniee.com")) {
      prefix = "/sweep";
    } else if (
      host === "timeformats.muniee.com" ||
      host.endsWith(".timeformats.muniee.com")
    ) {
      prefix = "/timeformats";
    } else if (
      host === "timezones.muniee.com" ||
      host.endsWith(".timezones.muniee.com")
    ) {
      prefix = "/timezones";
    } else if (host === "cron.muniee.com" || host.endsWith(".cron.muniee.com")) {
      prefix = "/cron";
    } else {
      prefix = "/landing";
    }

    const rewritten = new URL(prefix + url.pathname + url.search, url.origin);
    return env.ASSETS.fetch(new Request(rewritten, request));
  },
};