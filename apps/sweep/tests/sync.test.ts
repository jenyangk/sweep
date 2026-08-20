// Pure-logic tests for the pairing URL protocol (apps/sweep/src/lib/sync.ts).
// Run with `npm test -w @muniee/sweep` (node:test, no browser needed).
// These exercise the #2 QR-payload seam that #3 (crypto) extends.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJoinUrl, parseJoinUrl } from "../src/lib/sync.ts";

const ORIGIN = "https://sweep.muniee.com";

test("buildJoinUrl appends ?s=<session-id>", () => {
  assert.equal(
    buildJoinUrl(`${ORIGIN}/`, "abc-123"),
    `${ORIGIN}/?s=abc-123`,
  );
});

test("buildJoinUrl preserves existing query params", () => {
  assert.equal(
    buildJoinUrl(`${ORIGIN}/?utm=x`, "abc-123"),
    `${ORIGIN}/?utm=x&s=abc-123`,
  );
});

test("buildJoinUrl carries extra params (the #3 crypto seam: ?k=<key>)", () => {
  const url = buildJoinUrl(`${ORIGIN}/`, "abc-123", { k: "AESKEY" });
  assert.equal(parseJoinUrl(url, ORIGIN)?.extra.k, "AESKEY");
});

test("parseJoinUrl round-trips the session id", () => {
  const built = buildJoinUrl(`${ORIGIN}/`, "abc-123");
  const parsed = parseJoinUrl(built, ORIGIN);
  assert.equal(parsed?.sessionId, "abc-123");
  assert.deepEqual(parsed?.extra, {});
});

test("parseJoinUrl rejects other origins", () => {
  assert.equal(parseJoinUrl("https://evil.example/?s=abc-123", ORIGIN), null);
});

test("parseJoinUrl rejects URLs without a session id", () => {
  assert.equal(parseJoinUrl(`${ORIGIN}/`, ORIGIN), null);
});

test("parseJoinUrl rejects garbage", () => {
  assert.equal(parseJoinUrl("not a url", ORIGIN), null);
  assert.equal(parseJoinUrl("", ORIGIN), null);
});

test("parseJoinUrl extracts extra params alongside the session id", () => {
  const parsed = parseJoinUrl(`${ORIGIN}/?s=abc-123&k=K1`, ORIGIN);
  assert.equal(parsed?.sessionId, "abc-123");
  assert.equal(parsed?.extra.k, "K1");
});
