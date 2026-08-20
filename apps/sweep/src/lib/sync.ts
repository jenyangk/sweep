// Session sync — WebSocket relay client for sweep pairing.
//
// Ticket #1 (tracer bullet): plaintext "hello" messages through the
// SessionDO relay (worker/src/session.ts). The relay is a dumb echo pipe;
// all protocol lives here on the client.
//
// Ticket #2 (QR pairing, 1:1 enforcement): the host renders a QR encoding
// a join URL (buildJoinUrl); the phone scans it and joins the session.
// buildJoinUrl / parseJoinUrl are the extension seam for #3 (end-to-end
// encryption): #3 adds an AES key as an extra search param (?k=<key>), which
// round-trips through the `extra` record untouched.
//
// This module is DOM-free — the UI wiring lives in app.ts.

export type SyncStatus = "idle" | "connecting" | "connected" | "closed";

// Close code the relay uses to reject a third socket to a full session
// (worker/src/session.ts). Mirrored here so the UI can distinguish a
// "session full" rejection from a generic disconnect.
export const SESSION_FULL_CODE = 4001;

export interface SyncMessage {
  type: string;
  peerId: string;
  [key: string]: unknown;
}

export interface SyncHandle {
  readonly sessionId: string;
  readonly peerId: string;
  send(message: SyncMessage): void;
  close(): void;
}

export interface SyncOptions {
  onMessage(message: SyncMessage): void;
  onStatus(status: SyncStatus): void;
  /** The relay closed this socket because the session is full (1:1). */
  onRejected?(code: number, reason: string): void;
}

// Open a WebSocket to the session relay for `sessionId` and send a hello
// on connect. The relay echoes messages to other sockets in the session;
// this tab never receives its own messages back.
export function connectSession(
  sessionId: string,
  options: SyncOptions,
): SyncHandle {
  const peerId = crypto.randomUUID();
  const ws = new WebSocket(`/ws?s=${encodeURIComponent(sessionId)}`);

  ws.addEventListener("open", () => {
    options.onStatus("connected");
    ws.send(JSON.stringify({ type: "hello", peerId }));
  });

  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as SyncMessage;
      if (message && typeof message.type === "string") {
        options.onMessage(message);
      }
    } catch {
      // Non-JSON payloads are ignored; the envelope is the contract.
    }
  });

  ws.addEventListener("close", (event) => {
    if (event.code === SESSION_FULL_CODE) {
      options.onRejected?.(event.code, event.reason);
    }
    options.onStatus("closed");
  });
  ws.addEventListener("error", () => options.onStatus("closed"));

  return {
    sessionId,
    peerId,
    send(message: SyncMessage): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
    close(): void {
      ws.close();
    },
  };
}

// ----- Join-URL protocol (QR payload) -----
//
// The pairing QR encodes a join URL: <origin>/?s=<session-id>[&<extra>].
// `extra` is opaque key/value map carried verbatim into the URL — the
// extension seam for #3, which will add an AES key as ?k=<key>.

export interface ParsedJoinUrl {
  sessionId: string;
  /** Extra search params beyond `s` (the #3 crypto seam). */
  extra: Record<string, string>;
}

// Build the join URL that a pairing QR should encode. Any existing query
// params on `origin` are preserved; `s` is set (or overwritten) and each
// extra param is appended.
export function buildJoinUrl(
  origin: string,
  sessionId: string,
  extra: Record<string, string> = {},
): string {
  const url = new URL(origin);
  url.searchParams.set("s", sessionId);
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Parse a scanned/built URL into its session-id and extra params, or null
// if it is not a sweep join URL for `expectedOrigin` (origin match AND a
// non-empty `s` param). Origin matching prevents a scan of some other
// site's URL from being treated as a join.
export function parseJoinUrl(
  raw: string,
  expectedOrigin: string,
): ParsedJoinUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== expectedOrigin) return null;
  const sessionId = url.searchParams.get("s");
  if (!sessionId) return null;
  const extra: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "s") extra[key] = value;
  });
  return { sessionId, extra };
}

// The URL a second tab should open to join the same session. DOM-bound
// (uses window.location); the pure buildJoinUrl covers non-DOM callers.
export function joinUrl(sessionId: string): string {
  return buildJoinUrl(window.location.origin, sessionId);
}

// Session id from the URL (?s=<session-id>), if present.
export function sessionIdFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("s");
}
