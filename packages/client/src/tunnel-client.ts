import { EventEmitter } from "node:events";
import {
	type AuthMessage,
	type AuthResult,
	type ClientToServerEvents,
	DEFAULTS,
	type RegisterTunnelMessage,
	type RegisterTunnelResult,
	type ServerToClientEvents,
	type TcpRegisterMessage,
	type TcpRegisterResult,
	type TunnelRequest,
} from "@tunelo/shared";
import { type Socket, io } from "socket.io-client";
import { proxyRequest } from "./local-proxy.js";
import type { TunnelMapping } from "./tunnel-config-parser.js";

export interface TunnelClientOptions {
	serverUrl: string;
	apiKey: string;
	subdomain?: string;
	localPort: number;
	localHost?: string;
	/** Basic auth credentials "user:pass" */
	auth?: string;
	/** Additional tunnels to register after initial auth */
	additionalTunnels?: TunnelMapping[];
}

export class TunnelClient extends EventEmitter {
	private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null =
		null;
	private stopped = false;
	private attempts = 0;
	private readonly options: TunnelClientOptions;
	/** Maps subdomain → local port for multi-tunnel routing */
	private subdomainPortMap = new Map<string, number>();

	constructor(options: TunnelClientOptions) {
		super();
		this.options = options;
	}

	connect(): Promise<AuthResult> {
		return new Promise((resolve, reject) => {
			this.socket = io(this.options.serverUrl, {
				path: DEFAULTS.WS_PATH,
				transports: ["websocket", "polling"],
				reconnection: false,
			});

			let authResolved = false;

			this.socket.on("connect", () => {
				const authMsg: AuthMessage = {
					type: "auth",
					key: this.options.apiKey,
					subdomain: this.options.subdomain ?? "",
					auth: this.options.auth,
				};
				this.socket?.emit("auth", authMsg);
			});

			this.socket.on("auth-result", (result: AuthResult) => {
				if (authResolved) return;
				authResolved = true;

				if (!result.success) {
					this.socket?.disconnect();
					reject(new Error(result.error ?? "Auth failed"));
					return;
				}
				this.attempts = 0;
				// Map initial tunnel's subdomain to primary port
				this.subdomainPortMap.set(result.subdomain, this.options.localPort);
				this.emit("connected", result);

				// Register additional tunnels after initial auth
				this.registerAdditionalTunnels();
				resolve(result);
			});

			// Handle additional tunnel registration results
			this.socket.on(
				"register-tunnel-result",
				(result: RegisterTunnelResult) => {
					if (result.success) {
						this.subdomainPortMap.set(result.subdomain, result.localPort);
						this.emit("tunnel-registered", result);
					} else {
						this.emit("tunnel-register-error", result);
					}
				},
			);

			// Handle TCP registration results
			this.socket.on("tcp-register-result", (result: TcpRegisterResult) => {
				if (result.success) {
					this.emit("tcp-registered", result);
				} else {
					this.emit("tcp-register-error", result);
				}
			});

			this.socket.on("request", (request: TunnelRequest) => {
				this.handleRequest(request);
			});

			this.socket.on("disconnect", () => {
				this.emit("disconnected");
				if (!this.stopped && authResolved) {
					this.reconnect();
				}
			});

			this.socket.on("connect_error", (err: Error) => {
				if (!authResolved) {
					authResolved = true;
					reject(err);
				}
				this.emit("error", err);
			});
		});
	}

	disconnect(): void {
		this.stopped = true;
		this.socket?.disconnect();
	}

	/** Register a TCP tunnel after auth */
	registerTcp(localPort: number, remotePort?: number): void {
		const msg: TcpRegisterMessage = {
			type: "tcp-register",
			localPort,
			remotePort,
		};
		this.socket?.emit("tcp-register", msg);
	}

	/** Get raw socket for TcpProxy to attach handlers */
	getSocket(): typeof this.socket {
		return this.socket;
	}

	private registerAdditionalTunnels(): void {
		const tunnels = this.options.additionalTunnels;
		if (!tunnels?.length) return;

		for (const tunnel of tunnels) {
			const msg: RegisterTunnelMessage = {
				type: "register-tunnel",
				subdomain: tunnel.subdomain,
				localPort: tunnel.port,
				auth: this.options.auth,
			};
			this.socket?.emit("register-tunnel", msg);
		}
	}

	private async handleRequest(request: TunnelRequest): Promise<void> {
		const start = Date.now();
		// Route by subdomain for multi-tunnel, fallback to primary port
		const targetPort = request.subdomain
			? (this.subdomainPortMap.get(request.subdomain) ?? this.options.localPort)
			: this.options.localPort;

		const response = await proxyRequest(
			request,
			targetPort,
			this.options.localHost,
		);
		this.socket?.emit("response", response);
		const durationMs = Date.now() - start;

		this.emit("request", {
			method: request.method,
			path: request.path,
			status: response.status,
			durationMs,
			subdomain: request.subdomain,
		});

		// Emit full data for inspector
		this.emit("inspector-entry", {
			id: request.id,
			timestamp: start,
			subdomain: request.subdomain,
			method: request.method,
			path: request.path,
			requestHeaders: request.headers,
			requestBody: request.body,
			status: response.status,
			responseHeaders: response.headers,
			responseBody: response.body,
			durationMs,
			entryType: "normal" as const,
		});
	}

	private async reconnect(): Promise<void> {
		this.subdomainPortMap.clear();
		let delay: number = DEFAULTS.RECONNECT_BASE_MS;
		while (!this.stopped) {
			this.attempts++;
			this.emit("reconnecting", { attempt: this.attempts, delay });
			await new Promise((r) => setTimeout(r, delay));
			try {
				await this.connect();
				return;
			} catch {
				delay = Math.min(delay * 2, DEFAULTS.RECONNECT_MAX_MS);
			}
		}
	}
}
