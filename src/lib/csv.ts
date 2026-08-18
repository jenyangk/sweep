import type { ParsedQr } from "./parse-qr";

export interface ScanRecord {
  id: string;
  timestamp: number;
  parsed: ParsedQr;
}

export function toCsv(records: ScanRecord[]): string {
  const header = ["#", "timestamp", "type", "content", "fields"];
  const rows = records.map((r, i) => {
    const ts = new Date(r.timestamp).toISOString();
    const type = r.parsed.type;
    const content = r.parsed.raw;
    const fields = Object.entries(r.parsed.fields)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return [i + 1, ts, type, content, fields];
  });
  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n\r]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(records: ScanRecord[]): void {
  const csv = toCsv(records);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sweep-scan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}