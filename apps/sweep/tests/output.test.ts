// Pure-logic tests for CSV/TXT export labeling (#3: remote scans are
// included and labeled as from the paired device).
// Run with `npm test -w @muniee/sweep` (node:test, no browser needed).

import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, toTxt, type ScanRecord } from "../src/lib/output.ts";

function record(source: "local" | "remote"): ScanRecord {
  return {
    id: "r1",
    timestamp: 1720000000000,
    source,
    parsed: {
      type: "url",
      raw: "https://example.com/qr",
      fields: { url: "https://example.com/qr" },
    },
  };
}

test("toCsv includes a source column labeled for remote scans", () => {
  const csv = toCsv([record("local"), record("remote")]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "#,timestamp,type,content,fields,source");
  assert.match(lines[2], /,paired device$/);
  assert.match(lines[1], /,this device$/);
});

test("toTxt labels remote scans as from the paired device", () => {
  const txt = toTxt([record("remote")]);
  assert.match(txt, /\(from paired device\)/);
});

test("toTxt labels local scans as from this device", () => {
  const txt = toTxt([record("local")]);
  assert.match(txt, /\(from this device\)/);
});
