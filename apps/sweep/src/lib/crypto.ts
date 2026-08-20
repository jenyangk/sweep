// End-to-end encryption for session sync (#3).
//
// The pairing QR carries a random AES-GCM 256-bit key (base64, as the
// `k` extra param in the join URL). The host generates it in the browser;
// the phone extracts it from the scanned QR. Every scan is serialized to
// JSON and encrypted with a fresh 12-byte IV before it leaves the device,
// so the relay (SessionDO) and anything else on the wire only ever see
// ciphertext. The AES-GCM auth tag is appended to the ciphertext by
// crypto.subtle and verified on decrypt.
//
// This module is DOM-free (WebCrypto is global in browsers and Node 24).
// The wire envelope for a scan is:
//   { type: "scan", ct: <base64 ciphertext>, iv: <base64 iv> }

export interface EncryptedEnvelope {
  type: "scan";
  /** base64 AES-GCM ciphertext (includes the auth tag). */
  ct: string;
  /** base64 12-byte IV. */
  iv: string;
}

// Generate the session's shared AES-GCM key. Called by the host when it
// pairs; the exported raw key rides in the QR as ?k=<base64>.
export async function generateSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// Raw key → base64, for the QR payload (?k=<base64>).
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

// base64 → raw key, for the phone side of a scan (QR → key in memory).
export async function importKeyFromBase64(b64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(b64);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// Serialize a scan payload to JSON and encrypt it with a fresh random IV.
// Returns the wire envelope ({type:"scan", ct, iv}) — the ciphertext and
// IV are base64 so they travel as plain JSON strings through the relay.
// The relay never sees the plaintext JSON.
export async function encryptScan(
  key: CryptoKey,
  payload: unknown,
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    json,
  );
  return { type: "scan", ct: bytesToBase64(new Uint8Array(ct)), iv: bytesToBase64(iv) };
}

// Decrypt a wire envelope back into the original JSON payload. Throws on
// tamper, wrong key, or malformed input (the GCM auth tag is verified by
// crypto.subtle).
export async function decryptScan<T>(
  key: CryptoKey,
  ct: string,
  iv: string,
): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    key,
    base64ToBytes(ct),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
