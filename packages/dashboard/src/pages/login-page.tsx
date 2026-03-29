// Login page — email + password + TOTP, redirects to /dashboard/overview on success
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/use-auth.js";

export function LoginPage(): React.ReactElement {
	const { login } = useAuth();
	const navigate = useNavigate();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: FormEvent): Promise<void> {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			await login({ email, password, totpCode });
			navigate("/overview", { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed");
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
						Sign in to your admin account
					</p>
				</div>

				<form
					onSubmit={(e) => void handleSubmit(e)}
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
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
							placeholder="••••••••"
						/>
					</div>

					<div>
						<label
							className="block text-sm font-medium text-gray-700 mb-1"
							htmlFor="totp"
						>
							Authenticator Code
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
							className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono tracking-widest"
							placeholder="000000"
						/>
					</div>

					<button
						type="submit"
						disabled={submitting}
						className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{submitting ? "Signing in…" : "Sign in"}
					</button>

					<p className="text-center text-sm text-gray-500">
						Don't have an account?{" "}
						<Link
							to="/signup"
							className="text-indigo-600 hover:text-indigo-700 font-medium"
						>
							Create account
						</Link>
					</p>
				</form>
			</div>
		</div>
	);
}
