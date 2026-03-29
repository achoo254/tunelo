export interface KeyInfo {
	userId: string;
	keyId: string;
	keyHash: string;
	maxTunnels: number;
	plan: string;
	role: "user" | "admin";
}

export interface KeyStore {
	validate(keyHash: string): Promise<KeyInfo | null>;
	recordUsage(keyHash: string): Promise<void>;
	initialize(): Promise<void>;
	shutdown(): Promise<void>;
}
