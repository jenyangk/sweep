# 03 — Encrypted scan sync with remote-tagged results

**What to build:** The actual feature. The pairing QR now also carries a random AES-GCM key generated in the browser. On scan, the phone encrypts the `ScanRecord` JSON with the shared key and sends it over the socket; the browser decrypts and adds it via `addScan` tagged `source: 'remote'` (so it isn't re-broadcast, preventing loops). Remote scans appear in the results table and CSV export, labeled as from the paired device. The relay only ever sees ciphertext.

**Blocked by:** 02 — Pair via QR scan, auto-hide, 1:1 lock

**Status:** ready-for-agent

- [ ] The pairing QR encodes both the session-id and a random AES-GCM 256-bit key generated in the browser
- [ ] The phone extracts the key from the scanned QR and stores it in memory for the session
- [ ] On scan, the phone encrypts the `ScanRecord` JSON (AES-GCM with a fresh random IV) and sends `{type:"scan", ct, iv}` over the WS — the relay only ever relays ciphertext
- [ ] The browser decrypts incoming scan messages with the shared key and calls `addScan(parsed)` with a `source: 'remote'` flag
- [ ] Remote-origin scans are NOT re-broadcast (no loop)
- [ ] Remote scans appear in the results table and are included in CSV/TXT exports, labeled as from the paired device
- [ ] A scan performed on the browser also syncs to the phone (bidirectional)
- [ ] The DO never sees plaintext — verify by inspecting relayed message contents
- [ ] Build and deploy succeed