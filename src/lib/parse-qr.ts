export type QrContentType =
  | "url"
  | "wifi"
  | "vcard"
  | "email"
  | "phone"
  | "sms"
  | "geo"
  | "base64"
  | "text";

export interface ParsedQr {
  type: QrContentType;
  raw: string;
  fields: Record<string, string>;
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function tryDecodeBase64(s: string): string | null {
  if (s.length < 8 || !BASE64_RE.test(s)) return null;
  try {
    const decoded = atob(s);
    const printable = [...decoded].filter(
      (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126,
    ).length;
    if (printable / decoded.length > 0.85) return decoded;
  } catch {
    /* not base64 */
  }
  return null;
}

export function parseQrContent(raw: string): ParsedQr {
  const text = raw.trim();

  if (/^https?:\/\//i.test(text)) {
    return { type: "url", raw, fields: { url: text } };
  }

  if (/^wifi:/i.test(text)) {
    const body = text.slice(5);
    const fields: Record<string, string> = {};
    for (const part of body.split(";")) {
      const [k, ...rest] = part.split(":");
      if (k && rest.length) fields[k.toUpperCase()] = rest.join(":");
    }
    return { type: "wifi", raw, fields };
  }

  if (/^begin:vcard/i.test(text)) {
    const fields: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).toUpperCase();
      const val = line.slice(idx + 1);
      if (key.startsWith("FN")) fields.name = val;
      else if (key.startsWith("TEL")) fields.phone = val;
      else if (key.startsWith("EMAIL")) fields.email = val;
      else if (key.startsWith("ORG")) fields.org = val;
      else if (key.startsWith("TITLE")) fields.title = val;
    }
    return { type: "vcard", raw, fields };
  }

  if (/^mailto:/i.test(text)) {
    const email = text.slice(7).split("?")[0];
    return { type: "email", raw, fields: { email } };
  }

  if (/^tel:/i.test(text)) {
    return { type: "phone", raw, fields: { phone: text.slice(4) } };
  }

  if (/^sms:/i.test(text)) {
    return { type: "sms", raw, fields: { phone: text.slice(4) } };
  }

  if (/^geo:/i.test(text)) {
    return { type: "geo", raw, fields: { coords: text.slice(4) } };
  }

  const b64 = tryDecodeBase64(text);
  if (b64 !== null) {
    return { type: "base64", raw, fields: { decoded: b64 } };
  }

  return { type: "text", raw, fields: {} };
}

export function describeType(type: QrContentType): string {
  switch (type) {
    case "url":
      return "URL";
    case "wifi":
      return "WiFi";
    case "vcard":
      return "vCard";
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "sms":
      return "SMS";
    case "geo":
      return "Geo";
    case "base64":
      return "Base64";
    default:
      return "Text";
  }
}