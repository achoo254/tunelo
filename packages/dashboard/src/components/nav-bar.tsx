// Top navigation bar with links to all dashboard pages and logout button
import { NavLink } from "react-router-dom";
import type { AuthUser } from "../hooks/use-auth.js";

interface NavBarProps {
	user: AuthUser;
	onLogout: () => void;
}

const NAV_LINKS = [
	{ to: "overview", label: "Overview" },
	{ to: "users", label: "Users" },
	{ to: "keys", label: "API Keys" },
	{ to: "tunnels", label: "Tunnels" },
	{ to: "usage", label: "Usage" },
];

export function NavBar({ user, onLogout }: NavBarProps): React.ReactElement {
	return (
		<nav className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between shadow-md">
			<div className="flex items-center gap-6">
				<span className="font-bold text-lg tracking-tight text-indigo-400">
					Tunelo Admin
				</span>
				<div className="flex gap-1">
					{NAV_LINKS.map((link) => (
						<NavLink
							key={link.to}
							to={link.to}
							className={({ isActive }) =>
								`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
									isActive
										? "bg-indigo-600 text-white"
										: "text-gray-300 hover:bg-gray-700 hover:text-white"
								}`
							}
						>
							{link.label}
						</NavLink>
					))}
				</div>
			</div>
			<div className="flex items-center gap-3 text-sm">
				<span className="text-gray-400">{user.email}</span>
				<button
					type="button"
					onClick={onLogout}
					className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
				>
					Logout
				</button>
			</div>
		</nav>
	);
}
