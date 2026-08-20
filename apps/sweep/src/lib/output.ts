import type { ParsedQr } from "./parse-qr";

export interface ScanRecord {
  id: string;
  timestamp: number;
  parsed: ParsedQr;
}

function csvCell(s: unknown): string {
  const str = String(s ?? "");
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(records: ScanRecord[]): string {
  const header = ["#", "timestamp", "type", "content", "fields"];
  const rows = records.map((r, i) => {
    const fields = Object.entries(r.parsed.fields)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return [i + 1, new Date(r.timestamp).toISOString(), r.parsed.type, r.parsed.raw, fields];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function toTxt(records: ScanRecord[]): string {
  return records
    .map((r, i) => {
      const time = new Date(r.timestamp).toLocaleString();
      const fields = Object.entries(r.parsed.fields)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      return `[${i + 1}] ${time}\n${r.parsed.type}\n${r.parsed.raw}${fields ? "\n" + fields : ""}`;
    })
    .join("\n\n");
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsv(records: ScanRecord[]): void {
  download(`sweep-${stamp()}.csv`, toCsv(records), "text/csv;charset=utf-8");
}

export function downloadTxt(records: ScanRecord[]): void {
  download(`sweep-${stamp()}.txt`, toTxt(records), "text/plain;charset=utf-8");
}

export async function copyResults(records: ScanRecord[]): Promise<boolean> {
  const text = records.map((r) => r.parsed.raw).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}