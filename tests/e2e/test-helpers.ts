import http from "node:http";
import { customAlphabet } from "nanoid";
import { type WebSocket, WebSocketServer } from "ws";
const generateSubdomain = customAlphabet(
	"abcdefghijklmnopqrstuvwxyz0123456789",
	8,
);
import {
	type AuthMessage,
	type AuthResult,
	DEFAULTS,
	ErrorCode,
	SUBDOMAIN_REGEX,
	type TunnelMessage,
	type TunnelRequest,
	type TunnelResponse,
	buildTunnelUrl,
} from "@tunelo/shared";

/** Start a minimal tunnel server on random port for testing */
export async function startTunnelServer(options?: {
	port?: number;
	keys?: string[];
}): Promise<{ port: number; cleanup: () => Promise<void> }> {
	const keys = new Set(options?.keys ?? []);

	const tunnels = new Map<string, WebSocket>();
	const pendingRequests = new Map<
		string,
		{
			resolve: (res: TunnelResponse) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

	const server = http.createServer((req, res) => {
		if (req.url === "/health") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ status: "ok", activeTunnels: tunnels.size }));
			return;
		}

		const host = req.headers.host ?? "";
		const match = host.match(/^([^.]+)\.tunnel\.inetdev\.io\.vn/);
		const subdomain = match ? match[1] : null;

		if (!subdomain) {
			res.writeHead(400);
			res.end("No subdomain");
			return;
		}

		const ws = tunnels.get(subdomain);
		if (!ws) {
			res.writeHead(502);
			res.end("Tunnel not found");
			return;
		}

		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => chunks.push(c));
		req.on("end", () => {
			const body =
				chunks.length > 0 ? Buffer.concat(chunks).toString("base64") : null;
			const id = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
			const tunnelReq: TunnelRequest = {
				type: "request",
				id,
				method: req.method ?? "GET",
				path: req.url ?? "/",
				headers: req.headers as Record<string, string | string[]>,
				body,
			};

			const timeout = setTimeout(() => {
				pendingRequests.delete(id);
				res.writeHead(504);
				res.end("Gateway Timeout");
			}, 10_000);

			pendingRequests.set(id, {
				resolve: (tunnelRes) => {
					clearTimeout(timeout);
					const responseBody = tunnelRes.body
						? Buffer.from(tunnelRes.body, "base64")
						: null;
					res.writeHead(
						tunnelRes.status,
						tunnelRes.headers as http.OutgoingHttpHeaders,
					);
					res.end(responseBody);
				},
				timer: timeout,
			});

			ws.send(JSON.stringify(tunnelReq));
		});
	});

	const wss = new WebSocketServer({ noServer: true });

	server.on("upgrade", (req, socket, head) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
		if (url.pathname === DEFAULTS.WS_PATH) {
			wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
		} else {
			socket.destroy();
		}
	});

	wss.on("connection", (ws) => {
		ws.on("message", (data) => {
			let msg: TunnelMessage;
			try {
				msg = JSON.parse(data.toString()) as TunnelMessage;
			} catch {
				return;
			}

			if (msg.type === "auth") {
				const auth = msg as AuthMessage;
				if (keys.size > 0 && !keys.has(auth.key)) {
					ws.send(
						JSON.stringify({
							type: "auth-result",
							success: false,
							subdomain: "",
							url: "",
							error: "Invalid API key",
						} satisfies AuthResult),
					);
					ws.close();
					return;
				}
				const sub = auth.subdomain || generateSubdomain();
				if (!SUBDOMAIN_REGEX.test(sub)) {
					ws.send(
						JSON.stringify({
							type: "auth-result",
							success: false,
							subdomain: sub,
							url: "",
							error: "Invalid subdomain",
						} satisfies AuthResult),
					);
					ws.close();
					return;
				}
				if (tunnels.has(sub)) {
					ws.send(
						JSON.stringify({
							type: "auth-result",
							success: false,
							subdomain: sub,
							url: "",
							error: "Subdomain taken",
						} satisfies AuthResult),
					);
					ws.close();
					return;
				}
				tunnels.set(sub, ws);
				ws.send(
					JSON.stringify({
						type: "auth-result",
						success: true,
						subdomain: sub,
						url: buildTunnelUrl(sub),
					} satisfies AuthResult),
				);
				ws.on("close", () => tunnels.delete(sub));
			} else if (msg.type === "response") {
				const pending = pendingRequests.get((msg as TunnelResponse).id);
				if (pending) {
					pendingRequests.delete((msg as TunnelResponse).id);
					pending.resolve(msg as TunnelResponse);
				}
			} else if (msg.type === "pong") {
				// Keepalive acknowledged
			}
		});
	});

	return new Promise((resolve) => {
		server.listen(options?.port ?? 0, () => {
			const addr = server.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			resolve({
				port,
				cleanup: () =>
					new Promise<void>((res) => {
						for (const [, ws] of tunnels) ws.close();
						for (const [, p] of pendingRequests) clearTimeout(p.timer);
						wss.close();
						server.close(() => res());
					}),
			});
		});
	});
}

/** Start a local HTTP echo server for testing */
export async function startLocalServer(port?: number): Promise<{
	port: number;
	requests: Array<{ method: string; path: string; body: string }>;
	cleanup: () => Promise<void>;
}> {
	const requests: Array<{ method: string; path: string; body: string }> = [];

	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => chunks.push(c));
		req.on("end", () => {
			const body = Buffer.concat(chunks).toString();
			requests.push({
				method: req.method ?? "GET",
				path: req.url ?? "/",
				body,
			});

			res.writeHead(200, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					method: req.method,
					path: req.url,
					headers: req.headers,
					body: body || null,
				}),
			);
		});
	});

	return new Promise((resolve) => {
		server.listen(port ?? 0, () => {
			const addr = server.address();
			const p = typeof addr === "object" && addr ? addr.port : 0;
			resolve({
				port: p,
				requests,
				cleanup: () => new Promise<void>((res) => server.close(() => res())),
			});
		});
	});
}

/** Make HTTP request through tunnel server with custom Host header */
export async function requestThroughTunnel(
	serverPort: number,
	subdomain: string,
	path: string,
	options?: {
		method?: string;
		body?: string;
		headers?: Record<string, string>;
	},
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				hostname: "localhost",
				port: serverPort,
				path,
				method: options?.method ?? "GET",
				headers: {
					host: `${subdomain}.tunnel.inetdev.io.vn`,
					...options?.headers,
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (c: Buffer) => chunks.push(c));
				res.on("end", () => {
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers as Record<string, string>,
						body: Buffer.concat(chunks).toString(),
					});
				});
			},
		);
		req.on("error", reject);
		if (options?.body) req.write(options.body);
		req.end();
	});
}
