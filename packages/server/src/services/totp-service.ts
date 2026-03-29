import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Tunelo";

export function generateTotpSecret(email: string): {
	secret: string;
	otpauthUrl: string;
} {
	const secret = generateSecret();
	const otpauthUrl = generateURI({
		secret,
		issuer: ISSUER,
		label: email,
		algorithm: "sha1",
		digits: 6,
		period: 30,
	});
	return { secret, otpauthUrl };
}

export async function generateQrDataUrl(otpauthUrl: string): Promise<string> {
	return QRCode.toDataURL(otpauthUrl);
}

export function verifyTotpCode(secret: string, code: string): boolean {
	const result = verifySync({ secret, token: code });
	return result.valid;
}
