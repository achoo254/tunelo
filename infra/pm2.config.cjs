module.exports = {
	apps: [
		{
			name: "tunelo-server",
			script: "server.cjs",
			cwd: "/opt/tunelo",
			instances: 1,
			exec_mode: "fork",
			env: {
				NODE_ENV: "production",
				TUNNEL_PORT: 3001,
				API_KEYS_FILE: "/opt/tunelo/keys.json",
			},
			max_memory_restart: "512M",
			log_date_format: "YYYY-MM-DD HH:mm:ss",
			error_file: "/var/log/tunelo/error.log",
			out_file: "/var/log/tunelo/out.log",
			merge_logs: true,
			kill_timeout: 5000,
			listen_timeout: 3000,
			autorestart: true,
			max_restarts: 10,
			min_uptime: "10s",
		},
	],
};
