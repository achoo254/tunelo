import { EventEmitter } from "node:events";
import {
	type AuthMessage,
	type AuthResult,
	DEFAULTS,
	type RegisterTunnelMessage,
	type RegisterTunnelResult,
	type ServerToClientMessage,
	type TcpConnectionClose,
	type TcpConnectionOpen,
	type TcpDataMessage,
	type TcpRegisterMessage,
	type TcpRegisterResult,
	type TunnelRequest,
	parseMessage,
} from "@tunelo/shared";
import WebSocket from "ws";
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
	private socket: WebSocket | null = null;
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
			const wsUrl = this.buildWsUrl();
			this.socket = new WebSocket(wsUrl);

			let authResolved = false;

			this.socket.on("open", () => {
				const authMsg: AuthMessage = {
					type: "auth",
					key: this.options.apiKey,
					subdomain: this.options.subdomain ?? "",
					auth: this.options.auth,
				};
				this.socket?.send(JSON.stringify(authMsg));
			});

			this.socket.on("message", (data) => {
				let msg: ServerToClientMessage;
				try {
					msg = parseMessage(data.toString()) as ServerToClientMessage;
				} catch {
					return;
				}

				switch (msg.type) {
					case "auth-result":
						this.handleAuthResult(msg, authResolved, resolve, reject);
						if (!authResolved) authResolved = true;
						break;
					case "register-tunnel-result":
						this.handleRegisterTunnelResult(msg);
						break;
					case "tcp-register-result":
						this.handleTcpRegisterResult(msg);
						break;
					case "request":
						this.handleRequest(msg);
						break;
					case "tcp-connection-open":
						this.emit("tcp-connection-open", msg);
						break;
					case "tcp-data":
						this.emit("tcp-data", msg);
						break;
					case "tcp-connection-close":
						this.emit("tcp-connection-close", msg);
						break;
					default:
						break;
				}
			});

			this.socket.on("close", () => {
				this.emit("disconnected");
				if (!this.stopped && authResolved) {
					this.reconnect();
				}
			});

			this.socket.on("error", (err: Error) => {
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
		this.socket?.close();
	}

	/** Register a TCP tunnel after auth */
	registerTcp(localPort: number, remotePort?: number): void {
		const msg: TcpRegisterMessage = {
			type: "tcp-register",
			localPort,
			remotePort,
		};
		this.sendMsg(msg);
	}

	/** Get raw socket for TcpProxy to attach handlers */
	getSocket(): WebSocket | null {
		return this.socket;
	}

	/** Send a JSON message over the WebSocket */
	sendMsg(msg: unknown): void {
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(msg));
		}
	}

	private buildWsUrl(): string {
		// Convert http(s) to ws(s) and append WS_PATH
		const url = this.options.serverUrl
			.replace(/^https:\/\//, "wss://")
			.replace(/^http:\/\//, "ws://");
		return `${url}${DEFAULTS.WS_PATH}`;
	}

	private handleAuthResult(
		result: AuthResult,
		alreadyResolved: boolean,
		resolve: (r: AuthResult) => void,
		reject: (e: Error) => void,
	): void {
		if (alreadyResolved) return;

		if (!result.success) {
			this.socket?.close();
			reject(new Error(result.error ?? "Auth failed"));
			return;
		}
		this.attempts = 0;
		this.subdomainPortMap.set(result.subdomain, this.options.localPort);
		this.emit("connected", result);
		this.registerAdditionalTunnels();
		resolve(result);
	}

	private handleRegisterTunnelResult(result: RegisterTunnelResult): void {
		if (result.success) {
			this.subdomainPortMap.set(result.subdomain, result.localPort);
			this.emit("tunnel-registered", result);
		} else {
			this.emit("tunnel-register-error", result);
		}
	}

	private handleTcpRegisterResult(result: TcpRegisterResult): void {
		if (result.success) {
			this.emit("tcp-registered", result);
		} else {
			this.emit("tcp-register-error", result);
		}
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
			this.sendMsg(msg);
		}
	}

	private async handleRequest(request: TunnelRequest): Promise<void> {
		const start = Date.now();
		const targetPort = request.subdomain
			? (this.subdomainPortMap.get(request.subdomain) ?? this.options.localPort)
			: this.options.localPort;

		const response = await proxyRequest(
			request,
			targetPort,
			this.options.localHost,
		);
		this.sendMsg(response);
		const durationMs = Date.now() - start;

		this.emit("request", {
			method: request.method,
			path: request.path,
			status: response.status,
			durationMs,
			subdomain: request.subdomain,
		});

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
