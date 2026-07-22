import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { logger } from "../lib/logger.js";
import { execShell, isContainerAlive } from "../services/docker.service.js";
import { getSessionForUser, heartbeat, verifyWsTicket } from "../services/session.service.js";

const wss = new WebSocketServer({ noServer: true });

/** Cleanly close all live terminal sockets (used during graceful shutdown). */
export function closeAllTerminals(): void {
  for (const client of wss.clients) {
    try {
      client.close(1001, "server shutting down");
    } catch {
      /* ignore */
    }
  }
}

export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const url = new URL(req.url ?? "", "http://internal");
  if (url.pathname !== "/ws/terminal") {
    socket.destroy();
    return;
  }

  const ticket = url.searchParams.get("ticket");
  if (!ticket) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  let claims: { sessionId: string; userId: string };
  try {
    claims = verifyWsTicket(ticket);
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    bridge(ws, claims.sessionId, claims.userId).catch((err) => {
      logger.error("terminal bridge error", { err });
      ws.close();
    });
  });
}

async function bridge(ws: WebSocket, sessionId: string, userId: string): Promise<void> {
  const session = await getSessionForUser(sessionId, userId);
  if (!session.container_id || !["running", "checking"].includes(session.status)) {
    ws.close(1008, "session not running");
    return;
  }
  if (!(await isContainerAlive(session.container_id))) {
    ws.close(1011, "container not running");
    return;
  }

  const { stream, resize } = await execShell(session.container_id);

  stream.on("data", (chunk: Buffer) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk);
  });
  stream.on("end", () => ws.close());
  stream.on("error", () => ws.close());

  ws.on("message", (data, isBinary) => {
    const buf = toBuffer(data);
    if (!isBinary) {
      const text = buf.toString("utf8");
      if (text.startsWith("{")) {
        try {
          const msg = JSON.parse(text);
          if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
            resize({ h: msg.rows, w: msg.cols }).catch(() => {});
            return;
          }
        } catch {
          // fall through to writing raw text as terminal input
        }
      }
    }
    heartbeat(sessionId, userId).catch(() => {});
    stream.write(buf);
  });

  ws.on("close", () => {
    stream.end();
  });
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
