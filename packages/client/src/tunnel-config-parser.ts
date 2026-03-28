import { SUBDOMAIN_REGEX } from "@tunelo/shared";

export interface TunnelMapping {
	port: number;
	subdomain?: string;
}

/** Parse "port:subdomain" or "port" syntax into TunnelMapping */
export function parseTunnelArg(arg: string): TunnelMapping {
	const parts = arg.split(":");

	if (parts.length === 1) {
		const port = validatePort(parts[0]);
		return { port };
	}

	if (parts.length === 2) {
		const port = validatePort(parts[0]);
		const subdomain = parts[1];
		if (!SUBDOMAIN_REGEX.test(subdomain)) {
			throw new Error(`Invalid subdomain format: "${subdomain}"`);
		}
		return { port, subdomain };
	}

	throw new Error(
		`Invalid tunnel format: "${arg}". Use <port> or <port>:<subdomain>`,
	);
}

/** Parse multiple tunnel args into TunnelMapping array */
export function parseTunnelArgs(args: string[]): TunnelMapping[] {
	if (args.length === 0) throw new Error("At least one port is required");
	return args.map(parseTunnelArg);
}

function validatePort(portStr: string): number {
	const port = Number(portStr);
	if (Number.isNaN(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid port: "${portStr}" (must be 1-65535)`);
	}
	return port;
}
