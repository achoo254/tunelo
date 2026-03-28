/** WS message types for tunnel protocol — discriminated union on "type" field */

export interface TunnelRequest {
	type: "request";
	id: string;
	method: string;
	path: string;
	headers: Record<string, string | string[]>;
	body: string | null;
	/** Subdomain this request is targeting — filled by server from Host header */
	subdomain?: string;
}

export interface TunnelResponse {
	type: "response";
	id: string;
	status: number;
	headers: Record<string, string | string[]>;
	body: string | null;
}

export interface AuthMessage {
	type: "auth";
	key: string;
	subdomain: string;
	/** Basic auth credentials in "user:pass" format — sent during tunnel registration */
	auth?: string;
}

export interface AuthResult {
	type: "auth-result";
	success: boolean;
	subdomain: string;
	url: string;
	error?: string;
}

export interface ErrorMessage {
	type: "error";
	code: ErrorCode;
	message: string;
	requestId?: string;
}

export interface PingMessage {
	type: "ping";
	timestamp: number;
}

export interface PongMessage {
	type: "pong";
	timestamp: number;
}

/** Register additional tunnel on existing WS connection (after initial auth) */
export interface RegisterTunnelMessage {
	type: "register-tunnel";
	subdomain?: string;
	localPort: number;
	auth?: string;
}

/** Server response to register-tunnel */
export interface RegisterTunnelResult {
	type: "register-tunnel-result";
	success: boolean;
	subdomain: string;
	localPort: number;
	url: string;
	error?: string;
}

/** TCP tunnel — register a TCP port mapping */
export interface TcpRegisterMessage {
	type: "tcp-register";
	localPort: number;
	remotePort?: number;
}

/** TCP tunnel — server response to tcp-register */
export interface TcpRegisterResult {
	type: "tcp-register-result";
	success: boolean;
	localPort: number;
	remotePort: number;
	url: string;
	error?: string;
}

/** TCP tunnel — bidirectional binary data relay (base64 encoded) */
export interface TcpDataMessage {
	type: "tcp-data";
	connectionId: string;
	data: string;
}

/** TCP tunnel — new TCP connection opened on server */
export interface TcpConnectionOpen {
	type: "tcp-connection-open";
	connectionId: string;
	remotePort: number;
	sourceIp: string;
}

/** TCP tunnel — connection closed (bidirectional) */
export interface TcpConnectionClose {
	type: "tcp-connection-close";
	connectionId: string;
}

export type ServerToClientMessage =
	| TunnelRequest
	| AuthResult
	| RegisterTunnelResult
	| TcpRegisterResult
	| TcpConnectionOpen
	| TcpDataMessage
	| TcpConnectionClose
	| ErrorMessage
	| PingMessage;
export type ClientToServerMessage =
	| TunnelResponse
	| AuthMessage
	| RegisterTunnelMessage
	| TcpRegisterMessage
	| TcpDataMessage
	| TcpConnectionClose
	| ErrorMessage
	| PongMessage;
export type TunnelMessage = ServerToClientMessage | ClientToServerMessage;

/** Socket.IO typed events for server ↔ client communication */
export interface ServerToClientEvents {
	"auth-result": (result: AuthResult) => void;
	"register-tunnel-result": (result: RegisterTunnelResult) => void;
	"tcp-register-result": (result: TcpRegisterResult) => void;
	"tcp-connection-open": (msg: TcpConnectionOpen) => void;
	"tcp-data": (msg: TcpDataMessage) => void;
	"tcp-connection-close": (msg: TcpConnectionClose) => void;
	request: (request: TunnelRequest) => void;
	error: (error: ErrorMessage) => void;
}

export interface ClientToServerEvents {
	auth: (msg: AuthMessage) => void;
	"register-tunnel": (msg: RegisterTunnelMessage) => void;
	"tcp-register": (msg: TcpRegisterMessage) => void;
	"tcp-data": (msg: TcpDataMessage) => void;
	"tcp-connection-close": (msg: TcpConnectionClose) => void;
	response: (response: TunnelResponse) => void;
}

export enum ErrorCode {
	AUTH_FAILED = "AUTH_FAILED",
	SUBDOMAIN_TAKEN = "SUBDOMAIN_TAKEN",
	SUBDOMAIN_INVALID = "SUBDOMAIN_INVALID",
	REQUEST_TIMEOUT = "REQUEST_TIMEOUT",
	TUNNEL_NOT_FOUND = "TUNNEL_NOT_FOUND",
	BODY_TOO_LARGE = "BODY_TOO_LARGE",
	UNAUTHORIZED = "UNAUTHORIZED",
	INTERNAL_ERROR = "INTERNAL_ERROR",
}
