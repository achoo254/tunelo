// Signup page — 2-step: register (email+password) → verify TOTP (scan QR + enter code)
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";

type Step = "register" | "verify-totp";

interface SignupResult {
	userId: string;
	qrDataUrl: string;
}

export function SignupPage(): React.ReactElement {
	const navigate = useNavigate();

	const [step, setStep] = useState<Step>("register");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [userId, setUserId] = useState("");
	const [qrDataUrl, setQrDataUrl] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleRegister(e: FormEvent): Promise<void> {
		e.preventDefault();
		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}
		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const result = await apiFetch<SignupResult>("/api/auth/signup", {
				method: "POST",
				body: JSON.stringify({ email, password }),
			});
			setUserId(result.userId);
			setQrDataUrl(result.qrDataUrl);
			setStep("verify-totp");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Signup failed");
		} finally {
			setSubmitting(false);
		}
	}

	async function handleVerifyTotp(e: FormEvent): Promise<void> {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			await apiFetch("/api/auth/verify-totp", {
				method: "POST",
				body: JSON.stringify({ userId, totpCode }),
			});
			navigate("/overview", { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Verification failed");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
			<div className="w-full max-w-sm">
				<div className="text-center mb-8">
					<h1 className="text-2xl font-bold text-gray-900">Tunelo Admin</h1>
					<p className="mt-1 text-sm text-gray-500">
						{step === "register"
							? "Create your admin account"
							: "Set up two-factor authentication"}
					</p>
				</div>

				{step === "register" && (
					<form
						onSubmit={(e) => void handleRegister(e)}
						className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4"
					>
						{error && (
							<div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">
								{error}
							</div>
						)}

						<div>
							<label
								className="block text-sm font-medium text-gray-700 mb-1"
								htmlFor="email"
							>
								Email
							</label>
							<input
								id="email"
								type="email"
								required
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
								placeholder="admin@example.com"
							/>
						</div>

						<div>
							<label
								className="block text-sm font-medium text-gray-700 mb-1"
								htmlFor="password"
							>
								Password
							</label>
							<input
								id="password"
								type="password"
								required
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
								placeholder="Min 8 characters"
							/>
						</div>

						<div>
							<label
								className="block text-sm font-medium text-gray-700 mb-1"
								htmlFor="confirm-password"
							>
								Confirm Password
							</label>
							<input
								id="confirm-password"
								type="password"
								required
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
								placeholder="Re-enter password"
							/>
						</div>

						<button
							type="submit"
							disabled={submitting}
							className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{submitting ? "Creating account…" : "Create account"}
						</button>

						<p className="text-center text-sm text-gray-500">
							Already have an account?{" "}
							<Link
								to="/login"
								className="text-indigo-600 hover:text-indigo-700 font-medium"
							>
								Sign in
							</Link>
						</p>
					</form>
				)}

				{step === "verify-totp" && (
					<form
						onSubmit={(e) => void handleVerifyTotp(e)}
						className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4"
					>
						{error && (
							<div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">
								{error}
							</div>
						)}

						<div className="text-center space-y-2">
							<p className="text-sm text-gray-600">
								Scan this QR code with your authenticator app
							</p>
							<img
								src={qrDataUrl}
								alt="TOTP QR Code"
								className="mx-auto w-48 h-48 border border-gray-200 rounded-lg p-2"
							/>
							<p className="text-xs text-gray-400">
								Google Authenticator, Authy, or similar
							</p>
						</div>

						<div>
							<label
								className="block text-sm font-medium text-gray-700 mb-1"
								htmlFor="totp"
							>
								Verification Code
							</label>
							<input
								id="totp"
								type="text"
								required
								inputMode="numeric"
								autoComplete="one-time-code"
								value={totpCode}
								onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
								maxLength={6}
								className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono tracking-widest text-center"
								placeholder="000000"
							/>
						</div>

						<button
							type="submit"
							disabled={submitting || totpCode.length !== 6}
							className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{submitting ? "Verifying…" : "Verify & Sign in"}
						</button>
					</form>
				)}
			</div>
		</div>
	);
}
