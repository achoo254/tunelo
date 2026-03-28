import pino from "pino";

/** Shared pino timestamp formatter — human-readable dd/MM/yyyy HH:mm:ss */
const timestamp = (): string =>
	`,"time":"${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}"`;

/** Create a named child logger with shared config */
export function createLogger(name: string): pino.Logger {
	return pino({ name, timestamp });
}
