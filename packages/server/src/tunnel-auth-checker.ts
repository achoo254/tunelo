/** Basic Auth validation for tunnel connections — constant-time comparison */

import { createHash, timingSafeEqual } from "node:crypto";

/** Hash credentials with SHA-256 */
export function hashCredentials(credentials: string): string {
	return createHash("sha256").update(credentials).digest("hex");
}

/** Check if Authorization header matches stored hash. Returns true if no auth required. */
export function checkBasicAuth(
	authHash: string | undefined,
	authHeader: string | undefined,
): boolean {
	if (!authHash) return true; // No auth configured

	if (!authHeader) return false;

	// Parse "Basic <base64>"
	const match = authHeader.match(/^Basic\s+(.+)$/i);
	if (!match) return false;

	let credentials: string;
	try {
		credentials = Buffer.from(match[1], "base64").toString("utf-8");
	} catch {
		return false;
	}

	// Constant-time comparison to prevent timing attacks
	const credHash = createHash("sha256").update(credentials).digest("hex");
	const expected = Buffer.from(authHash, "hex");
	const actual = Buffer.from(credHash, "hex");
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
