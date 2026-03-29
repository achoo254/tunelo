// Root app component — router setup with protected routes and layout
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/nav-bar.js";
import { useAuth } from "./hooks/use-auth.js";
import { KeysPage } from "./pages/keys-page.js";
import { LoginPage } from "./pages/login-page.js";
import { SignupPage } from "./pages/signup-page.js";
import { OverviewPage } from "./pages/overview-page.js";
import { TunnelsPage } from "./pages/tunnels-page.js";
import { UsagePage } from "./pages/usage-page.js";
import { UsersPage } from "./pages/users-page.js";

// Protected layout — wraps authenticated pages with NavBar, renders child via Outlet
function ProtectedLayout(): React.ReactElement {
	const { user, loading, isAuthenticated, logout } = useAuth();

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<p className="text-gray-400 text-sm">Loading…</p>
			</div>
		);
	}

	if (!isAuthenticated || !user) {
		return <Navigate to="login" replace />;
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<NavBar user={user} onLogout={() => void logout()} />
			<main className="max-w-7xl mx-auto px-6 py-8">
				<Outlet />
			</main>
		</div>
	);
}

export function App(): React.ReactElement {
	return (
		<BrowserRouter basename="/dashboard">
			<Routes>
				<Route path="login" element={<LoginPage />} />
				<Route path="signup" element={<SignupPage />} />
				<Route element={<ProtectedLayout />}>
					<Route path="overview" element={<OverviewPage />} />
					<Route path="users" element={<UsersPage />} />
					<Route path="keys" element={<KeysPage />} />
					<Route path="tunnels" element={<TunnelsPage />} />
					<Route path="usage" element={<UsagePage />} />
					<Route index element={<Navigate to="overview" replace />} />
				</Route>
				<Route path="*" element={<Navigate to="overview" replace />} />
			</Routes>
		</BrowserRouter>
	);
}
