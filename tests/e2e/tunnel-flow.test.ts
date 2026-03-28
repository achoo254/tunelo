import {
	type AuthMessage,
	type AuthResult,
	DEFAULTS,
	type TunnelMessage,
	type TunnelRequest,
	type TunnelResponse,
} from "@tunelo/shared";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import WebSocket from "ws";
import {
	requestThroughTunnel,
	startLocalServer,
	startTunnelServer,
} from "./test-helpers.js";

describe("Tunnel Flow E2E", () => {
	let serverPort: number;
	let localPort: number;
	let cleanupServer: () => Promise<void>;
	let cleanupLocal: () => Promise<void>;
	let ws: WebSocket;
	const subdomain = "testapp";

	beforeAll(async () => {
		const server = await startTunnelServer({ keys: ["tk_test123"] });
		serverPort = server.port;
		cleanupServer = server.cleanup;

		const local = await startLocalServer();
		localPort = local.port;
		cleanupLocal = local.cleanup;

		// Connect WS client
		ws = new WebSocket(`ws://localhost:${serverPort}${DEFAULTS.WS_PATH}`);
		await new Promise<void>((resolve, reject) => {
			ws.on("open", () => {
				ws.send(
					JSON.stringify({
						type: "auth",
						key: "tk_test123",
						subdomain,
					} satisfies AuthMessage),
				);
			});
			ws.on("message", (data) => {
				const msg = JSON.parse(data.toString()) as AuthResult;
				if (msg.type === "auth-result" && msg.success) resolve();
				else reject(new Error(msg.error));
			});
			ws.on("error", reject);
		});

		// Set up WS message handler — proxy requests to local server
		ws.on("message", (data) => {
			const msg = JSON.parse(data.toString()) as TunnelMessage;
			if (msg.type !== "request") return;
			const req = msg as TunnelRequest;

			// Proxy to local server
			const http = require("node:http") as typeof import("node:http");
			const body = req.body ? Buffer.from(req.body, "base64") : null;
			const proxyReq = http.request(
				{
					hostname: "localhost",
					port: localPort,
					path: req.path,
					method: req.method,
					headers: req.headers as Record<string, string>,
				},
				(proxyRes) => {
					const chunks: Buffer[] = [];
					proxyRes.on("data", (c: Buffer) => chunks.push(c));
					proxyRes.on("end", () => {
						const response: TunnelResponse = {
							type: "response",
							id: req.id,
							status: proxyRes.statusCode ?? 502,
							headers: proxyRes.headers as Record<string, string | string[]>,
							body:
								chunks.length > 0
									? Buffer.concat(chunks).toString("base64")
									: null,
						};
						ws.send(JSON.stringify(response));
					});
				},
			);
			proxyReq.on("error", () => {
				ws.send(
					JSON.stringify({
						type: "response",
						id: req.id,
						status: 502,
						headers: {},
						body: null,
					} satisfies TunnelResponse),
				);
			});
			if (body) proxyReq.write(body);
			proxyReq.end();
		});
	});

	afterAll(async () => {
		ws?.close();
		await cleanupLocal?.();
		await cleanupServer?.();
	});

	test("GET request relayed and response returned", async () => {
		const res = await requestThroughTunnel(serverPort, subdomain, "/api/test");
		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.method).toBe("GET");
		expect(body.path).toBe("/api/test");
	});

	test("POST with JSON body preserved", async () => {
		const payload = JSON.stringify({ hello: "world" });
		const res = await requestThroughTunnel(serverPort, subdomain, "/api/data", {
			method: "POST",
			body: payload,
			headers: { "content-type": "application/json" },
		});
		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.method).toBe("POST");
		expect(body.body).toBe(payload);
	});

	test("PUT and DELETE methods work", async () => {
		const putRes = await requestThroughTunnel(
			serverPort,
			subdomain,
			"/api/item/1",
			{ method: "PUT", body: '{"name":"updated"}' },
		);
		expect(putRes.status).toBe(200);
		expect(JSON.parse(putRes.body).method).toBe("PUT");

		const delRes = await requestThroughTunnel(
			serverPort,
			subdomain,
			"/api/item/1",
			{ method: "DELETE" },
		);
		expect(delRes.status).toBe(200);
		expect(JSON.parse(delRes.body).method).toBe("DELETE");
	});

	test("tunnel not found returns 502", async () => {
		const res = await requestThroughTunnel(
			serverPort,
			"nonexistent",
			"/api/test",
		);
		expect(res.status).toBe(502);
	});

	test("multiple concurrent requests", async () => {
		const promises = Array.from({ length: 10 }, (_, i) =>
			requestThroughTunnel(serverPort, subdomain, `/api/item/${i}`),
		);
		const results = await Promise.all(promises);
		for (const res of results) {
			expect(res.status).toBe(200);
		}
	});
});
