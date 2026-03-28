/** Safe WebSocket send — checks readyState before sending to prevent errors on closed connections */

import type { WebSocket } from "ws";
import WebSocketModule from "ws";

export function safeSend(ws: WebSocket, msg: unknown): void {
	if (ws.readyState === WebSocketModule.OPEN) {
		ws.send(JSON.stringify(msg));
	}
}
