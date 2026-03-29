# Phase 2: Portal — Device Auth Page

## Context

- Portal app: `packages/client/src/portal/app.tsx`
- Portal auth hook: `packages/client/src/portal/hooks/use-auth.ts`
- Portal API client: `packages/client/src/portal/api/client.ts`
- Portal pages dir: `packages/client/src/portal/pages/`
- Login page: `packages/client/src/portal/pages/login-page.tsx`

## Overview

- **Priority:** P1
- **Status:** complete
- **Effort:** 3h
- **Depends on:** Phase 1 (server device auth API)
- Add `/auth/device` route to Portal SPA. Shows user code, requires login/signup, then approves.

## Requirements

### Functional
- Route `/auth/device?code=XXXX-XXXX` — device auth confirmation page
- If user not logged in → redirect to login/signup, preserve `code` param
- After login → show user code confirmation: "Authorize this device? Code: XXXX-XXXX"
- User clicks "Approve" → calls `POST /api/auth/device/approve` with userCode
- Success → show "Device authorized! You can close this tab."
- Error → show error message (expired, invalid code, too many attempts)

### Non-Functional
- Reuse existing portal auth flow (login/signup pages)
- Minimal new components — just one page + minor routing changes

## Architecture

```
Browser opens: https://tunnel.inetdev.io.vn/portal/auth/device?code=XXXX-XXXX
                    ↓
            [User logged in?]
            ↓ No           ↓ Yes
     Redirect to      Show confirmation:
     /login?next=     "Authorize device?
     /auth/device     Code: XXXX-XXXX"
     ?code=XXXX       [Approve] button
            ↓                ↓
     User logs in      POST /api/auth/device/approve
            ↓                ↓
     Redirect back     "Device authorized!
     to /auth/device   Close this tab."
```

## Files to Create

| File | Purpose |
|------|---------|
| `packages/client/src/portal/pages/device-auth-page.tsx` | Device authorization confirmation page |

## Files to Modify

| File | Change |
|------|--------|
| `packages/client/src/portal/app.tsx` | Add `/auth/device` route, update AuthGuard for `?next=` redirect |
| `packages/client/src/portal/pages/login-page.tsx` | Pass `?next=` param after successful login |
| `packages/client/src/portal/pages/signup-page.tsx` | Pass `?next=` param after successful signup |

## Implementation Steps

### 1. Create Device Auth Page

```tsx
// packages/client/src/portal/pages/device-auth-page.tsx
export function DeviceAuthPage(): React.ReactElement {
  // 1. Extract ?code= from URL search params
  // 2. If no code → show error "No device code provided"
  // 3. Show card: "Authorize Device" + display code XXXX-XXXX
  // 4. Approve button → POST /api/auth/device/approve { userCode }
  // 5. Success → show "Device authorized! You can close this tab."
  // 6. Error → show error (expired, invalid, too many attempts)
}
```

UI design:
- Centered card (same style as login page)
- Title: "Authorize Device"
- Code display: large monospace `XXXX-XXXX`
- Security note: "Make sure this code matches what you see in your terminal"
- Green "Approve" button
- Success state: checkmark + "Device authorized" message

### 2. Update App Router

Add route in `app.tsx`:
```tsx
// Add to PUBLIC_PATHS
const PUBLIC_PATHS = new Set(["/login", "/signup", "/auth/device"]);

// But DeviceAuthPage needs auth — use a semi-protected approach:
// Route is public (no redirect loop), but page checks auth internally
<Route path="/auth/device" element={<DeviceAuthPage />} />
```

Actually, `/auth/device` should be a **protected route** — user must be logged in to approve. AuthGuard should redirect to `/login?next=/auth/device?code=XXXX-XXXX`.

### 3. Update Login Page — Support `?next=` Redirect

Current login redirects to `/keys` on success. Change to:
```tsx
// In login-page.tsx handleSubmit:
const searchParams = new URLSearchParams(window.location.search);
const next = searchParams.get('next') || '/keys';
if (ok) navigate(next);
```

Same change in `signup-page.tsx`.

### 4. Update AuthGuard — Preserve `?next=` Param

```tsx
// In AuthGuard, when redirecting to /login:
const currentUrl = location.pathname + location.search;
navigate(`/login?next=${encodeURIComponent(currentUrl)}`, { replace: true });
```

## Todo List

- [x] Create `device-auth-page.tsx` with approve flow
- [x] Add `/auth/device` route in `app.tsx`
- [x] Update AuthGuard to pass `?next=` param
- [x] Update `login-page.tsx` to redirect to `?next=` after login
- [x] Update `signup-page.tsx` to redirect to `?next=` after signup
- [x] Test: unauthenticated user → login → approve → success
- [x] Test: already logged in → approve → success
- [x] Test: expired code → error message
- [x] Test: invalid code → error message

## Success Criteria

- Full flow: browser opens → login if needed → show code → approve → success message
- `?next=` redirect works for both login and signup
- Error states handled gracefully
- UI consistent with existing portal pages
