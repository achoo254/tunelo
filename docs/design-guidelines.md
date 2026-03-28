# Design Guidelines

## CLI User Experience

### Command Format

```bash
tunelo http <port> [options]

Options:
  --subdomain, -s   Custom subdomain name (default: random)
  --key, -k         API key (default: from config)
  --server           Server URL (default: from config)
  --config, -c       Config file path (default: ~/.tunelo/config.json)
  --version, -v      Show version
  --help, -h         Show help
```

### Terminal Output

```
+---------------------------------------------+
|  tunelo                          v0.1.0     |
+---------------------------------------------+
|  Status:    Online                          |
|  Tunnel:    https://myapp.tunnel.inetdev.io.vn |
|  Forwarding: http://localhost:3000          |
+---------------------------------------------+
|  GET  /api/users          200  12ms         |
|  POST /api/login          200  45ms         |
|  GET  /static/app.js      304   3ms         |
+---------------------------------------------+
```

### Output Rules

- Use chalk for colors: green (success), red (error), yellow (warning), cyan (info)
- Status bar always visible at top
- Request log scrolls below status bar
- Show method, path, status code, response time
- Color status codes: 2xx green, 3xx cyan, 4xx yellow, 5xx red

### Connection States

| State | Display |
|-------|---------|
| Connecting | `Status: Connecting...` (yellow) |
| Online | `Status: Online` (green) |
| Reconnecting | `Status: Reconnecting (attempt 3/10)...` (yellow) |
| Offline | `Status: Offline` (red) |

### Error Messages

User-facing errors should be:
- Clear and actionable
- Include error code for reference
- Suggest next steps when possible

```
Error: Invalid API key (TUNELO_AUTH_001)
  Check your key with: tunelo config --show
  Set a new key with: tunelo config --key <your-key>
```

## Config File

Location: `~/.tunelo/config.json`

```json
{
  "server": "wss://tunnel.inetdev.io.vn",
  "key": "tk_abc123..."
}
```

**Priority (highest to lowest):**
1. CLI flags (`--key`, `--server`)
2. Environment variables (`TUNELO_KEY`, `TUNELO_SERVER`)
3. Config file (`~/.tunelo/config.json`)
4. Defaults (server: `wss://tunnel.inetdev.io.vn`, key: none)

**Config management:**
- Config created on first run
- Can be edited manually or via future `tunelo config` command
- Always stored in user's home directory (`~/.tunelo/`)

## Command Examples

### Basic tunnel (random subdomain)
```bash
tunelo http 3000
# Output:
# tunelo v0.1.0
# Status: Online
# Tunnel: https://xyz123.tunnel.inetdev.io.vn
# Forwarding: http://localhost:3000
```

### Custom subdomain
```bash
tunelo http 3000 --subdomain myapp
# Tunnel: https://myapp.tunnel.inetdev.io.vn
```

### Specify API key
```bash
tunelo http 3000 --key tk_xxxxxxxx
```

### Custom server
```bash
tunelo http 3000 --server wss://my-tunnel-server.com
```

### Set config permanently
```bash
# Future: tunelo config --key tk_xxxxxxxx --server wss://...
```
