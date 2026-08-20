// Pure-logic tests for the #3 end-to-end encryption layer
// (apps/sweep/src/lib/crypto.ts). Run with `npm test -w @muniee/sweep`
// (node:test, WebCrypto is global in Node 24 — no browser needed).
//
// Covers: key generate/export/import (the ?k= QR payload round-trip),
// AES-GCM encrypt/decrypt round-trip, fresh IV per encryption, tamper and
// wrong-key rejection, and the ticket's "the relay only ever sees
// ciphertext" property — the wire envelope carries no plaintext.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSessionKey,
  exportKeyToBase64,
  importKeyFromBase64,
  encryptScan,
  decryptScan,
  type EncryptedEnvelope,
} from "../src/lib/crypto.ts";
import { buildJoinUrl, parseJoinUrl } from "../src/lib/sync.ts";

const ORIGIN = "https://sweep.muniee.com";

// A ScanRecord-shaped payload: what the sender encrypts for the peer.
const SAMPLE = {
  parsed: {
    type: "url",
    raw: "https://example.com/secret-token",
    fields: { url: "https://example.com/secret-token" },
  },
  timestamp: 1720000000000,
};

test("generated key is AES-GCM 256, extractable, encrypt+decrypt", async () => {
  const key = await generateSessionKey();
  assert.equal(key.algorithm.name, "AES-GCM");
  assert.equal(key.algorithm.length, 256);
  assert.equal(key.extractable, true);
  assert.deepEqual([...key.usages].sort(), ["decrypt", "encrypt"]);
});

test("key round-trips through base64 (the ?k= QR payload)", async () => {
  const key = await generateSessionKey();
  const b64 = await exportKeyToBase64(key);
  const imported = await importKeyFromBase64(b64);
  assert.equal(await exportKeyToBase64(imported), b64);
});

test("encrypt/decrypt round-trips a scan payload", async () => {
  const key = await generateSessionKey();
  const { ct, iv } = await encryptScan(key, SAMPLE);
  const plain = await decryptScan(key, ct, iv);
  assert.deepEqual(plain, SAMPLE);
});

test("fresh IV and fresh ciphertext per encryption", async () => {
  const key = await generateSessionKey();
  const a = await encryptScan(key, SAMPLE);
  const b = await encryptScan(key, SAMPLE);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test("IV is 12 bytes (GCM standard)", async () => {
  const key = await generateSessionKey();
  const { iv } = await encryptScan(key, SAMPLE);
  assert.equal(atob(iv).length, 12);
});

test("wrong key cannot decrypt", async () => {
  const key = await generateSessionKey();
  const other = await generateSessionKey();
  const { ct, iv } = await encryptScan(key, SAMPLE);
  await assert.rejects(decryptScan(other, ct, iv));
});

test("tampered ciphertext is rejected (GCM auth tag)", async () => {
  const key = await generateSessionKey();
  const { ct, iv } = await encryptScan(key, SAMPLE);
  const bytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
  bytes[0] ^= 0xff;
  const tampered = btoa(String.fromCharCode(...bytes));
  await assert.rejects(decryptScan(key, tampered, iv));
});

test("the wire envelope carries no plaintext (relay sees only ciphertext)", async () => {
  const key = await generateSessionKey();
  const { ct, iv } = await encryptScan(key, SAMPLE);
  const envelope: EncryptedEnvelope = { type: "scan", ct, iv };
  const wire = JSON.stringify(envelope);
  assert.equal(wire.includes(SAMPLE.parsed.raw), false);
  assert.equal(wire.includes("secret-token"), false);
  // ct is base64 text on the wire, not raw bytes.
  assert.doesNotThrow(() => atob(ct));
});

test("base64 key round-trips through the join URL (?k=)", async () => {
  const key = await generateSessionKey();
  const b64 = await exportKeyToBase64(key);
  const url = buildJoinUrl(`${ORIGIN}/`, "abc-123", { k: b64 });
  const parsed = parseJoinUrl(url, ORIGIN);
  assert.equal(parsed?.sessionId, "abc-123");
  assert.equal(parsed?.extra.k, b64);
  const imported = await importKeyFromBase64(parsed!.extra.k);
  assert.equal(await exportKeyToBase64(imported), b64);
});
