# 01 — Pair two tabs through a session relay

**What to build:** The first stateful backend in the repo. A Cloudflare Durable Object acts as a per-session relay; the Worker validates WebSocket upgrades and routes to the DO by session-id. In the sweep UI, a "Pair device" button generates a session-id and opens a socket; a second tab can join the same session (via URL param at this stage) and the two see each other's "hello" messages in the UI. Plaintext, no crypto, no QR yet — this proves the whole pipe end-to-end with minimal UI. Includes the `wrangler.toml` DO binding + migration tag (v1, `new_sqlite_classes`).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `wrangler.toml` declares a Durable Object binding + a v1 migration with `new_sqlite_classes`
- [ ] A `SessionDO` class extends `DurableObject` from `cloudflare:workers` and uses the Hibernation WebSocket API (`ctx.acceptWebSocket`)
- [ ] The Worker validates the `Upgrade: websocket` header (returns 426 if missing) and routes the upgrade to `env.SWEEP_SESSION.getByName(sessionId).fetch(request)`
- [ ] The DO broadcasts any incoming WS message to all other attached sockets (echo relay)
- [ ] Sweep UI has a "Pair device" button that generates a `crypto.randomUUID()` session-id and opens a WS to the relay
- [ ] A second tab can join the same session via a URL param (`?s=<session-id>`) and the two tabs see each other's "hello" messages in the UI
- [ ] Local dev (`npm run dev`) connects both tabs on the same relay; `wrangler dev` serves the WS on :8787
- [ ] A hibernation auto-response is configured for client pings so the DO doesn't wake on keepalive
- [ ] Build (`npm run build`) succeeds and the Worker deploys cleanly