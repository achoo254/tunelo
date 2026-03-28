import type http from "node:http";
import {
	DEFAULTS,
	ErrorCode,
	TUNNEL_DOMAIN,
	type TunnelRequest,
	generateRequestId,
} from "@tunelo/shared";
import { createLogger } from "./logger.js";
import { tunnelManager } from "./tunnel-manager.js";

const logger = createLogger("tunelo-relay");

export function extractSubdomain(host: string): string | null {
	const domainEscaped = TUNNEL_DOMAIN.replace(/\./g, "\\.");
	const regex = new RegExp(`^([^.]+)\\.${domainEscaped}`);
	const match = host.match(regex);
	return match ? match[1] : null;
}

export function createRelayHandler(): http.RequestListener {
	return (req, res) => {
		// Health check — handled before relay
		if (req.url === DEFAULTS.HEALTH_PATH && req.method === "GET") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ status: "ok", ...tunnelManager.getStats() }));
			return;
		}

		const host = req.headers.host ?? "";
		const subdomain = extractSubdomain(host);

		if (!subdomain) {
			res.writeHead(400, { "content-type": "text/plain" });
			res.end("Bad Request: no tunnel subdomain in Host header");
			return;
		}

		if (
			!tunnelManager.has(subdomain) &&
			!tunnelManager.isInGracePeriod(subdomain)
		) {
			res.writeHead(502, { "content-type": "text/plain" });
			res.end(`Tunnel not found: ${subdomain}`);
			return;
		}

		// Basic Auth check — before relaying request to client
		if (
			!tunnelManager.checkAuth(
				subdomain,
				req.headers.authorization as string | undefined,
			)
		) {
			res.writeHead(401, {
				"content-type": "text/plain",
				"www-authenticate": 'Basic realm="tunelo"',
			});
			res.end("Unauthorized");
			return;
		}

		// Collect request body with size limit
		const chunks: Buffer[] = [];
		let bodySize = 0;

		req.on("data", (chunk: Buffer) => {
			bodySize += chunk.length;
			if (bodySize > DEFAULTS.MAX_BODY_SIZE) {
				res.writeHead(413, { "content-type": "text/plain" });
				res.end("Request body too large");
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});

		req.on("end", () => {
			if (res.writableEnded) return;

			const body =
				chunks.length > 0 ? Buffer.concat(chunks).toString("base64") : null;

			const tunnelReq: TunnelRequest = {
				type: "request",
				id: generateRequestId(),
				method: req.method ?? "GET",
				path: req.url ?? "/",
				headers: req.headers as Record<string, string | string[]>,
				body,
				subdomain,
			};

			tunnelManager
				.sendRequest(subdomain, tunnelReq)
				.then((tunnelRes) => {
					// Write response back
					const responseBody = tunnelRes.body
						? Buffer.from(tunnelRes.body, "base64")
						: null;
					res.writeHead(
						tunnelRes.status,
						tunnelRes.headers as http.OutgoingHttpHeaders,
					);
					if (responseBody) {
						res.end(responseBody);
					} else {
						res.end();
					}
				})
				.catch((err) => {
					logger.error(
						{ err, subdomain, requestId: tunnelReq.id },
						"Relay error",
					);
					const isTimeout = (err as Error).message.includes(
						ErrorCode.REQUEST_TIMEOUT,
					);
					res.writeHead(isTimeout ? 504 : 502, {
						"content-type": "text/plain",
					});
					res.end(isTimeout ? "Gateway Timeout" : "Bad Gateway");
				});
		});

		req.on("error", (err) => {
			logger.error({ err }, "Request read error");
			if (!res.writableEnded) {
				res.writeHead(500, { "content-type": "text/plain" });
				res.end("Internal Server Error");
			}
		});
	};
}
