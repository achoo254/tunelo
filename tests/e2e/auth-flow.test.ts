import {
	type AuthMessage,
	type AuthResult,
	DEFAULTS,
	type TunnelMessage,
} from "@tunelo/shared";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import WebSocket from "ws";
import { startTunnelServer } from "./test-helpers.js";

describe("Auth Flow E2E", () => {
	let serverPort: number;
	let cleanupServer: () => Promise<void>;

	beforeAll(async () => {
		const server = await startTunnelServer({ keys: ["tk_valid_key"] });
		serverPort = server.port;
		cleanupServer = server.cleanup;
	});

	afterAll(async () => {
		await cleanupServer?.();
	});

	function connectAndAuth(
		key: string,
		subdomain = "",
	): Promise<{ result: AuthResult; ws: WebSocket }> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(
				`ws://localhost:${serverPort}${DEFAULTS.WS_PATH}`,
			);
			ws.on("open", () => {
				ws.send(
					JSON.stringify({
						type: "auth",
						key,
						subdomain,
					} satisfies AuthMessage),
				);
			});
			ws.on("message", (data) => {
				const msg = JSON.parse(data.toString()) as TunnelMessage;
				if (msg.type === "auth-result") {
					resolve({ result: msg as AuthResult, ws });
				}
			});
			ws.on("error", reject);
			setTimeout(() => reject(new Error("Auth timeout")), 5000);
		});
	}

	test("valid API key connects successfully", async () => {
		const { result, ws } = await connectAndAuth("tk_valid_key", "authtest1");
		expect(result.success).toBe(true);
		expect(result.subdomain).toBe("authtest1");
		expect(result.url).toContain("authtest1");
		ws.close();
	});

	test("invalid API key rejected", async () => {
		const { result, ws } = await connectAndAuth("tk_bad_key", "authtest2");
		expect(result.success).toBe(false);
		expect(result.error).toContain("Invalid");
		ws.close();
	});

	test("duplicate subdomain rejected", async () => {
		const { result: r1, ws: ws1 } = await connectAndAuth(
			"tk_valid_key",
			"duptest",
		);
		expect(r1.success).toBe(true);

		const { result: r2, ws: ws2 } = await connectAndAuth(
			"tk_valid_key",
			"duptest",
		);
		expect(r2.success).toBe(false);
		expect(r2.error).toContain("taken");

		ws1.close();
		ws2.close();
	});

	test("random subdomain assigned when not specified", async () => {
		const { result, ws } = await connectAndAuth("tk_valid_key");
		expect(result.success).toBe(true);
		expect(result.subdomain.length).toBeGreaterThan(0);
		ws.close();
	});

	test("invalid subdomain format rejected", async () => {
		const { result, ws } = await connectAndAuth("tk_valid_key", "-invalid");
		expect(result.success).toBe(false);
		expect(result.error).toContain("subdomain");
		ws.close();
	});
});
