// SessionDO — per-session WebSocket relay.
//
// One Durable Object instance per session-id (getByName(sessionId)), so a
// session's sockets always land on the same instance. The DO uses the
// Hibernation WebSocket API: sockets are accepted via ctx.acceptWebSocket
// and the DO can go to sleep between events; webSocketMessage /
// webSocketClose / webSocketError wake it only when there is work.
//
// Ticket #2 (QR pairing, 1:1 enforcement) adds:
//   - A session is exactly 1:1: at most two sockets (the host and one
//     paired peer). A third connection is accepted only long enough to be
//     rejected — on its first message it is closed with code 4001 "session
//     full" (see fetch/webSocketMessage). A plain HTTP rejection (e.g.
//     409) would surface to the browser as a generic error with no close
//     reason, while accept-then-close delivers code + reason in the
//     client's close event.
//   - Join/leave notifications: when the session reaches its second
//     socket, both sockets get {type:"peer-joined"} so the host can
//     auto-hide its QR; when a socket closes, the remaining socket gets
//     {type:"peer-left"} so it can show "Disconnected". (The peer's own
//     socket closing is visible locally; the *other* device's closing is
//     not — the relay must announce it.)
//   - Sessions are ephemeral: this DO holds no durable state (no
//     storage.put, no Durable Storage reads). When the last socket closes
//     the instance idles and is evicted; a later connection with the same
//     session-id creates a brand-new empty session.
//
// Ticket #3 (end-to-end encryption) extends this class and the message
// envelope in apps/sweep/src/lib/sync.ts rather than rewriting the pipe:
// client messages stay opaque relays; the QR payload gains a key param.
//
// Wire protocol (all JSON, {type, ...}):
//   client → relay   hello      {peerId}            (echoed to peers)
//   relay  → client  peer-joined                    (session reached 1:1)
//   relay  → client  peer-left                      (peer socket closed)

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

// Close code+reason for rejecting a third socket. Mirrored on the client
// in apps/sweep/src/lib/sync.ts (SESSION_FULL_CODE) so the UI can surface
// "session full" instead of a generic disconnect.
const SESSION_FULL_CODE = 4001;
const SESSION_FULL_REASON = "session full";

export class SessionDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Auto-reply to client pings without waking the DO. A later ticket will
    // add a keepalive that sends "ping"; without this auto-response every
    // keepalive would spin the instance up. Today nothing sends "ping", so
    // this is a forward-looking seam — but configuring it now means the relay
    // is ready and the keepalive can land in the client without touching the
    // DO.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const existing = this.ctx.getWebSockets();

    // 1:1 enforcement, rule: a session holds at most two sockets — the
    // host's own socket (the host pairs before the phone scans) and one
    // peer. A third is accepted only long enough to be rejected: tagging
    // it `extra` here, then closing it from webSocketMessage. Rejecting at
    // accept time (closing inside fetch) turned out to be unreliable — the
    // close frame never reaches the client (verified locally against
    // workerd; the 101 response swallows it). The client always sends a
    // `hello` immediately after open, so the rejection lands within
    // milliseconds and the client still gets a clean close event with code
    // 4001 and reason "session full".
    //
    // Edge case: if the host has not connected yet when a phone scans, the
    // phone becomes the first socket and a second phone becomes the
    // second — still 1:1, and any third is rejected.
    if (existing.length >= 2) {
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ extra: true });
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ extra: false });

    if (existing.length === 1) {
      // The session just reached its second socket: 1:1 is complete.
      // Announce to both sockets so each side can flip to the paired
      // state — the host auto-hides its QR even if it connected after the
      // peer (the peer's hello may already have been sent and missed it).
      const joined = { type: "peer-joined" };
      for (const socket of this.ctx.getWebSockets()) {
        socket.send(JSON.stringify(joined));
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // Echo relay: forward every message to all other attached sockets.
  // Messages stay opaque — ticket #3's encrypted payloads relay unchanged.
  // Extra (third+) sockets are rejected here on their first message: their
  // hello is not relayed, and the close handshake completes in
  // webSocketClose so the client sees code 4001 "session full".
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const tag = ws.deserializeAttachment() as { extra?: boolean } | null;
    if (tag?.extra) {
      ws.close(SESSION_FULL_CODE, SESSION_FULL_REASON);
      return;
    }
    const others = this.ctx.getWebSockets().filter((s) => s !== ws);
    for (const socket of others) {
      socket.send(message);
    }
  }

  webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): void {
    // Complete the close handshake. With compat_date < 2026-04-07 the
    // runtime does NOT auto-reply to the peer's close frame; the docs
    // require calling close() here (safe to call on a closing socket).
    // Without this, the peer's socket hangs in CLOSING and never fires
    // its close event — which the client needs to surface rejection or
    // leave the ephemeral session.
    //
    // Some close codes are reserved and cannot be sent (1005 = no status,
    // 1006 = abnormal disconnect, 1015 = TLS). Fall back to 1000 (normal
    // closure) for those; sending them throws InvalidAccessError, which
    // would abort this handler before socket cleanup completes.
    const closeCode = code === 1005 || code === 1006 || code === 1015 ? 1000 : code;
    ws.close(closeCode, reason);
    this.notifyPeerLeft(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    // The socket is already broken; nothing to complete.
    this.notifyPeerLeft(ws);
  }

  // Tell the remaining socket that its peer closed. An extra (rejected)
  // socket is skipped: its close is not a real leave. The closing socket
  // itself may still be listed while webSocketClose runs — skip it too.
  // When the last socket closes there is no one to tell, and with no
  // durable state the session is simply gone (ephemeral).
  notifyPeerLeft(ws: WebSocket): void {
    const tag = ws.deserializeAttachment() as { extra?: boolean } | null;
    if (tag?.extra) return;
    const remaining = this.ctx
      .getWebSockets()
      .filter((socket) => socket !== ws);
    if (remaining.length === 0) return;
    const left = JSON.stringify({ type: "peer-left" });
    for (const socket of remaining) {
      socket.send(left);
    }
  }
}
