# Phase 3: CLI — Device Auth Commands + Cleanup

## Context

- Current CLI auth: `packages/client/src/cli-auth-commands.ts`
- CLI entry: `packages/client/src/cli.ts`
- API client: `packages/client/src/api-client.ts`
- Config: `packages/client/src/config.ts`

## Overview

- **Priority:** P1
- **Status:** complete
- **Effort:** 4h
- **Depends on:** Phase 1 (server device auth API)
- Replace prompt-based register/login with device code flow. Open browser, poll for key.

## Requirements

### Functional
- `tunelo login` → create device code → open browser → poll → save key
- `tunelo register` → same flow but open signup page in browser
- `tunelo logout` → unchanged (remove key from config)
- Show user code in terminal for verification
- Show URL for manual copy-paste (SSH environments)
- 5 min timeout, 3s poll interval
- Spinner/progress indicator while waiting

### Non-Functional
- Cross-platform browser open (Windows, macOS, Linux)
- Graceful Ctrl+C handling during poll
- No new heavy dependencies (use `open` package, already lightweight)

## Files to Create

| File | Purpose |
|------|---------|
| `packages/client/src/cli-device-auth.ts` | Device code auth flow (open browser + poll) |

## Files to Modify

| File | Change |
|------|--------|
| `packages/client/src/cli.ts` | Replace `registerAuthCommands` import with new device auth |
| `packages/client/src/api-client.ts` | Add `createDeviceCode()` and `pollDeviceCode()` functions |
| `packages/client/package.json` | Add `open` dependency |

## Files to Delete

| File | Reason |
|------|--------|
| `packages/client/src/cli-auth-commands.ts` | Replaced by device code flow |

## Implementation Steps

### 1. Add API Client Functions

```typescript
// Add to packages/client/src/api-client.ts

export interface DeviceCodeResult {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
}

export async function createDeviceCode(
  baseUrl: string,
): Promise<DeviceCodeResult> {
  return request<DeviceCodeResult>(baseUrl, '/auth/device', {
    method: 'POST',
  });
}

export interface DevicePollResult {
  status: 'pending' | 'approved' | 'expired';
  key?: string;
  keyPrefix?: string;
  userId?: string;
  email?: string;
}

export async function pollDeviceCode(
  baseUrl: string,
  deviceCode: string,
): Promise<DevicePollResult> {
  return request<DevicePollResult>(baseUrl, '/auth/device/poll', {
    method: 'POST',
    body: { deviceCode },
  });
}
```

### 2. Create Device Auth Module

```typescript
// packages/client/src/cli-device-auth.ts
import open from 'open';
import * as api from './api-client.js';
import { loadConfig, saveConfig } from './config.js';

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 5 * 60 * 1000;

export function registerDeviceAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Login via browser')
    .action(async () => {
      await deviceAuthFlow('login');
    });

  program
    .command('register')
    .description('Create account via browser')
    .action(async () => {
      await deviceAuthFlow('signup');
    });

  program
    .command('logout')
    .description('Remove API key from config')
    .action(() => {
      // Same logic as before
    });
}

async function deviceAuthFlow(mode: 'login' | 'signup'): Promise<void> {
  const baseUrl = getServerBaseUrl();

  // 1. Create device code
  const { deviceCode, userCode, verificationUrl } =
    await api.createDeviceCode(baseUrl);

  // 2. Show info + open browser
  const url = mode === 'signup'
    ? verificationUrl.replace('/auth/device', '/signup') + `?next=${encodeURIComponent('/auth/device?code=' + userCode)}`
    : verificationUrl;

  console.log();
  console.log(`! Opening browser to ${mode}...`);
  console.log(`  ${url}`);
  console.log();
  console.log(`  Your code: ${userCode}`);
  console.log();

  await open(url).catch(() => {
    console.log('  Could not open browser. Open the URL above manually.');
  });

  // 3. Poll with spinner
  console.log('- Waiting for authentication...');

  const startTime = Date.now();
  let aborted = false;

  const onSigint = () => { aborted = true; };
  process.on('SIGINT', onSigint);

  try {
    while (!aborted && Date.now() - startTime < TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      const result = await api.pollDeviceCode(baseUrl, deviceCode);

      if (result.status === 'approved') {
        const config = loadConfig();
        config.key = result.key!;
        saveConfig(config);
        console.log(`✓ Logged in as ${result.email}`);
        console.log(`  API key saved: ${result.keyPrefix}`);
        return;
      }

      if (result.status === 'expired') {
        console.error('✗ Device code expired. Run the command again.');
        process.exit(1);
      }
    }

    if (aborted) {
      console.log('\nCancelled.');
    } else {
      console.error('✗ Timed out waiting for authentication.');
    }
    process.exit(1);
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}
```

### 3. Update CLI Entry

In `packages/client/src/cli.ts`:
```diff
- import { registerAuthCommands } from "./cli-auth-commands.js";
+ import { registerDeviceAuthCommands } from "./cli-device-auth.js";

- registerAuthCommands(program);
+ registerDeviceAuthCommands(program);
```

### 4. Delete Old Auth Commands

Delete `packages/client/src/cli-auth-commands.ts`.

### 5. Add `open` Dependency

```bash
cd packages/client && pnpm add open
```

## Todo List

- [x] Add `createDeviceCode()` + `pollDeviceCode()` to `api-client.ts`
- [x] Create `cli-device-auth.ts` with device auth flow
- [x] Update `cli.ts` to use new device auth commands
- [x] Delete `cli-auth-commands.ts`
- [x] Add `open` package dependency
- [x] Test: `tunelo login` → opens browser → poll → success
- [x] Test: `tunelo register` → opens browser signup → poll → success
- [x] Test: `tunelo logout` → removes key
- [x] Test: Ctrl+C cancels polling gracefully
- [x] Test: timeout after 5 min
- [x] Build check: `pnpm build` passes

## Success Criteria

- `tunelo login` opens browser, shows code, polls, saves key on success
- `tunelo register` opens browser to signup page
- `tunelo logout` works as before
- No prompt-based auth code remains
- Cross-platform browser open works
- Clean exit on Ctrl+C and timeout

## Security Considerations

- deviceCode never displayed to user (only used for polling)
- userCode displayed for user verification (matches terminal ↔ browser)
- API key only transmitted via poll response (never shown in browser)
