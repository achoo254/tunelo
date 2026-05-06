// PM2 ecosystem for production deploy
// Usage on VPS:
//   cd /var/www/tunelo
//   pm2 start ecosystem.config.cjs --update-env
//   pm2 save
//
// Loads /var/www/tunelo/.env via Node's native --env-file flag (Node 20+)

module.exports = {
	apps: [
		{
			name: "tunelo",
			script: "server.mjs",
			cwd: "/var/www/tunelo",
			node_args: "--env-file=/var/www/tunelo/.env",
			instances: 1,
			exec_mode: "fork",
			autorestart: true,
			max_memory_restart: "500M",
			kill_timeout: 5000,
			env: {
				NODE_ENV: "production",
			},
		},
	],
};
