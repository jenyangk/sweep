# 02 — Pair via QR scan, auto-hide, 1:1 lock

**What to build:** The real pairing UX on top of the relay from #1. The browser shows a QR encoding the join URL + session-id; the phone scans it using sweep's existing jsqr camera scanner and joins the session. The QR auto-hides once the first peer connects. The DO rejects a third connection so the session stays 1:1. Ephemeral: the session dies when the last socket closes.

**Blocked by:** 01 — Pair two tabs through a session relay

**Status:** ready-for-agent

- [ ] The "Pair device" button renders a QR code on screen encoding the join URL (`https://sweep.../?s=<session-id>`)
- [ ] The phone opens sweep, points the existing camera scanner at the QR, and sweep detects the join URL, extracts the session-id, and connects to the relay automatically
- [ ] Once the first peer connects, the QR auto-hides on the host (replaced by a "Paired with a device" state)
- [ ] The DO enforces 1:1: a third WS connection to the same session-id is rejected (closed with a clear reason)
- [ ] When the last socket on a session closes, the DO's session is gone (ephemeral — no persistence, no reconnect-after-refresh)
- [ ] The paired state is visible in the UI on both devices (e.g. "Paired" indicator)
- [ ] Build and deploy succeed