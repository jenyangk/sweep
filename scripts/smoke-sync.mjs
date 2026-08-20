// End-to-end smoke test for ticket #3: encrypted scan sync through the real
// SessionDO relay (wrangler dev on :8787).
//
// Verifies:
//   1. Two clients pair through the join URL (host + phone roles).
//   2. A scan made on the "phone" reaches the "host" (and vice versa),
//      decrypted with the QR-carried key.
//   3. The relay never sees plaintext: the raw frames each client receives
//      contain no plaintext scan content (only {type:"scan", ct, iv}).
//
// Requires: `npm run build` (assembles public/), then `wrangler dev --port 8787`
// in another terminal. Run with `node scripts/smoke-sync.mjs`.

import { connectSession } from "../apps/sweep/src/lib/sync.ts";
import {
  generateSessionKey,
  exportKeyToBase64,
  importKeyFromBase64,
  encryptScan,
  decryptScan,
} from "../apps/sweep/src/lib/crypto.ts";
import { parseQrContent } from "../apps/sweep/src/lib/parse-qr.ts";

const WS_URL = process.env.SWEEP_WS_URL ?? "ws://127.0.0.1:8787/ws";
const SESSION_ID = `smoke-${Date.now()}`;
const PLAINTEXT = "https://example.com/top-secret-qr-content";
const PLAINTEXT_PHONE = "https://example.com/phone-scan-content";

function log(label, msg) {
  console.log(`[${label}] ${msg}`);
}

async function main() {
  const key = await generateSessionKey();
  const keyB64 = await exportKeyToBase64(key);
  log("host", `session ${SESSION_ID} key ${keyB64.slice(0, 8)}...`);

  const seen = {
    host: [],
    phone: [],
  };
  const failures = [];
  const check = (label, cond, detail) => {
    if (cond) log("ok", `${label} — ${detail}`);
    else {
      failures.push(label);
      log("FAIL", `${label} — ${detail}`);
    }
  };

  // ----- Host (browser side): pairs, then waits for a scan from the phone.
  const host = connectSession(SESSION_ID, {
    wsUrl: `${WS_URL}?s=${SESSION_ID}`,
    peerId: "host-1",
    onStatus: () => {},
    onMessage: (m) => {
      if (m.type === "scan") seen.host.push(m);
    },
  });
  log("host", "connected");

  // ----- Phone (browser side): imports the key from the QR payload and joins.
  const phoneKey = await importKeyFromBase64(keyB64);
  const phone = connectSession(SESSION_ID, {
    wsUrl: `${WS_URL}?s=${SESSION_ID}`,
    peerId: "phone-1",
    onStatus: () => {},
    onMessage: (m) => {
      if (m.type === "scan") seen.phone.push(m);
    },
  });
  log("phone", "connected");

  // Give the relay a beat to reach 1:1.
  await new Promise((r) => setTimeout(r, 500));

  // ----- Phone scans something → host must receive it decrypted.
  const phoneParsed = parseQrContent(PLAINTEXT_PHONE);
  const phoneEnv = await encryptScan(phoneKey, {
    parsed: phoneParsed,
    timestamp: Date.now(),
  });
  phone.send(phoneEnv);
  log("phone", `sent encrypted scan: ${JSON.stringify(phoneEnv)}`);
  check("phone envelope has ct+iv", typeof phoneEnv.ct === "string" && typeof phoneEnv.iv === "string", "ct/iv present");
  check("phone envelope has no plaintext", !JSON.stringify(phoneEnv).includes(PLAINTEXT_PHONE), "plaintext absent from wire frame");

  await waitFor(() => seen.host.length >= 1, 3000).catch(() => {});
  if (seen.host.length >= 1) {
    const decrypted = await decryptScan(key, seen.host[0].ct, seen.host[0].iv);
    check("host decrypts phone scan", decrypted?.parsed?.raw === PLAINTEXT_PHONE, `got "${decrypted?.parsed?.raw}"`);
    check("host saw ciphertext only", !JSON.stringify(seen.host[0]).includes(PLAINTEXT_PHONE), "relayed frame had no plaintext");
  } else {
    check("host receives phone scan", false, "no scan arrived");
  }

  // ----- Host scans something → phone must receive it (bidirectional).
  const hostParsed = parseQrContent(PLAINTEXT);
  const hostEnv = await encryptScan(key, {
    parsed: hostParsed,
    timestamp: Date.now(),
  });
  host.send(hostEnv);
  log("host", "sent encrypted scan");
  check("host envelope has no plaintext", !JSON.stringify(hostEnv).includes(PLAINTEXT), "plaintext absent from wire frame");

  await waitFor(() => seen.phone.length >= 1, 3000).catch(() => {});
  if (seen.phone.length >= 1) {
    const decrypted = await decryptScan(phoneKey, seen.phone[0].ct, seen.phone[0].iv);
    check("phone decrypts host scan", decrypted?.parsed?.raw === PLAINTEXT, `got "${decrypted?.parsed?.raw}"`);
  } else {
    check("phone receives host scan", false, "no scan arrived");
  }

  host.close();
  phone.close();

  if (failures.length) {
    console.error(`\nSMOKE FAILED: ${failures.length} check(s)`);
    process.exit(1);
  }
  console.log("\nSMOKE PASS — relay saw ciphertext only; sync is bidirectional.");
  process.exit(0);
}

function waitFor(pred, ms) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (pred()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(t);
        reject(new Error("timeout"));
      }
    }, 50);
  });
}

main().catch((err) => {
  console.error("SMOKE ERROR:", err);
  process.exit(1);
});
