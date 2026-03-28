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

## Portal UI Guidelines (v0.3)

### Client Portal (localhost:4040)

**Purpose:** Self-service for users — sign up, verify TOTP, manage API keys, view usage.

**Flow:**
1. Sign up (email + password)
2. Verify TOTP (scan QR code in Google Authenticator, enter 6-digit code)
3. Get API key (displayed once, user copies to clipboard)
4. Return to CLI with key

**Pages:**

| Page | Purpose | Elements |
|------|---------|----------|
| **Sign Up** | Create account | Email input, password input, confirm password, submit button, login link |
| **TOTP Setup** | Configure 2FA | QR code, secret text (backup), verify button, 6-digit code input |
| **API Keys** | Manage keys | List of keys (label, created date, last used), create button, revoke button, copy button |
| **Usage** | View metrics | Line chart (requests over time), bar chart (bandwidth per key) |
| **Login** | Access portal | Email input, password input, 6-digit TOTP input, submit button |

**Design Rules:**
- Dark mode preferred (reduce eye strain)
- Monospace font for secrets/keys (easier to copy)
- Clear copy-to-clipboard buttons (key display, one-time only)
- Confirm dialogs for destructive actions (revoke key, etc.)
- Loading states during async operations
- Error notifications (toast, red background)
- Success confirmations (toast, green background)

### Admin Dashboard (/dashboard/*)

**Purpose:** Admin-only view of all users, tunnels, usage across platform.

**Protected by:** `ADMIN_EMAILS` env var + JWT role validation

**Pages:**

| Page | Purpose | Elements |
|------|---------|----------|
| **Users** | User management | Table (email, role, status, created, last login), filter, suspend/activate buttons |
| **Tunnels** | Active tunnels | Table (subdomain, user, connected time, request rate), filter by user |
| **Usage Stats** | Platform metrics | Line chart (total requests/day), bar chart (top keys), pie chart (bandwidth) |
| **API Keys** | All keys | Table (key prefix, user, label, status, created, expired), filter, revoke |

**Design Rules:**
- Clean data tables with sorting/filtering
- Charts using Recharts (responsive, dark theme)
- Color-coded status badges (active=green, suspended=red, expired=gray)
- Quick actions in table rows (edit, suspend, revoke)
- Date/time in ISO 8601 format or relative ("2 hours ago")
- Loading spinners during data fetch

### TOTP Setup Screen Design

**Element layout:**
1. **Header:** "Set up 2-Factor Authentication"
2. **Explanation:** "Scan with Google Authenticator to complete sign-up"
3. **QR Code:** 200x200px, centered, scannable
4. **Backup Code:** Gray box with monospace text, copy button
5. **Input:** "Enter the 6-digit code from your authenticator"
6. **Verify Button:** Primary action, disabled until 6 digits entered
7. **Error:** Red text below input if invalid code

**Accessibility:**
- QR code alt text: "Scan with Google Authenticator"
- Button labels: "Verify TOTP", "Create Key", "Revoke"
- Color contrast: WCAG AA (4.5:1 for text, 3:1 for buttons)
- Keyboard navigation: Tab through fields, Enter to submit

### API Key Display (One-Time)

**Design:**
- Large monospace text (20px+)
- Full key shown once on creation
- Copy button next to key (copy icon + "Copy")
- Warning: "This is the only time you'll see this key. Save it securely."
- After closing, key hash only visible (first 8 chars)
