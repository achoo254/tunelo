import { describe, expect, test } from "vitest";
import { extractSubdomain } from "../request-relay.js";

describe("extractSubdomain", () => {
	test("extracts from standard host header", () => {
		expect(extractSubdomain("myapp.tunnel.inetdev.io.vn")).toBe("myapp");
	});

	test("extracts with port in host", () => {
		expect(extractSubdomain("myapp.tunnel.inetdev.io.vn:3001")).toBe("myapp");
	});

	test("returns null for bare domain", () => {
		expect(extractSubdomain("tunnel.inetdev.io.vn")).toBeNull();
	});

	test("returns null for non-matching domain", () => {
		expect(extractSubdomain("example.com")).toBeNull();
	});

	test("extracts hyphenated subdomain", () => {
		expect(extractSubdomain("my-cool-app.tunnel.inetdev.io.vn")).toBe(
			"my-cool-app",
		);
	});
});
