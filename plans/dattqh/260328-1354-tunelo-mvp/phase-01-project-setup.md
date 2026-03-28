# Phase 1: Project Setup

## Overview
- **Priority:** P1 (blocking all other phases)
- **Status:** completed
- **Effort:** 2h
- **Description:** Initialize npm workspace monorepo with TypeScript, dev tooling, and project scaffolding.

## Key Insights
- npm workspaces simplify cross-package imports without publish step
- `tsx` for dev (fast TS execution), `tsc` for build
- Shared tsconfig.base.json avoids config duplication

## Requirements

### Functional
- Monorepo with 3 packages: server, client, shared
- TypeScript compilation working across all packages
- Dev scripts for hot-reload development
- Build scripts producing runnable JS

### Non-functional
- Node.js 20+ required
- Consistent code style across packages

## Architecture

```
tunelo/
├── packages/
│   ├── server/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── client/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── package.json           # workspace root
├── tsconfig.base.json
├── .gitignore
├── .env.example
└── README.md
```

## Related Code Files

### Files to Create
- `package.json` — workspace root with npm workspaces config
- `tsconfig.base.json` — shared TS compiler options
- `.gitignore` — node_modules, dist, .env, etc.
- `.env.example` — template for env vars
- `README.md` — project overview + quick start
- `packages/shared/package.json` — name: `@tunelo/shared`
- `packages/shared/tsconfig.json` — extends base
- `packages/shared/src/index.ts` — barrel export
- `packages/server/package.json` — name: `@tunelo/server`, depends on `@tunelo/shared`
- `packages/server/tsconfig.json` — extends base
- `packages/server/src/server.ts` — placeholder entry
- `packages/client/package.json` — name: `@tunelo/client`, depends on `@tunelo/shared`
- `packages/client/tsconfig.json` — extends base
- `packages/client/src/cli.ts` — placeholder entry

## Implementation Steps

### 1. Initialize root package.json
```jsonc
{
  "name": "tunelo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:server": "npm run dev -w @tunelo/server",
    "dev:client": "npm run dev -w @tunelo/client",
    "build": "npm run build -w @tunelo/shared && npm run build -w @tunelo/server && npm run build -w @tunelo/client",
    "clean": "rm -rf packages/*/dist"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "tsx": "^4.7",
    "vitest": "^1.6"
  },
  "engines": { "node": ">=20" }
}
```

### 2. Create tsconfig.base.json
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

### 3. Create packages/shared
- `package.json`: name `@tunelo/shared`, main `dist/index.js`, types `dist/index.d.ts`
- `tsconfig.json`: extends `../../tsconfig.base.json`
- `src/index.ts`: empty barrel export placeholder
- Scripts: `"build": "tsc"`, `"dev": "tsc --watch"`

### 4. Create packages/server
- `package.json`: name `@tunelo/server`, depends on `@tunelo/shared`, `ws`, `nanoid`
- `tsconfig.json`: extends base, references shared
- `src/server.ts`: placeholder `console.log('tunelo server')`
- Scripts: `"build": "tsc"`, `"dev": "tsx watch src/server.ts"`, `"start": "node dist/server.js"`

### 5. Create packages/client
- `package.json`: name `@tunelo/client`, depends on `@tunelo/shared`, `ws`, `commander`, `chalk`
- `tsconfig.json`: extends base, references shared
- `src/cli.ts`: placeholder with `#!/usr/bin/env node` shebang
- `bin` field in package.json pointing to `dist/cli.js`
- Scripts: `"build": "tsc"`, `"dev": "tsx watch src/cli.ts"`

### 6. Create .gitignore
```
node_modules/
dist/
.env
*.tgz
.DS_Store
```

### 7. Create .env.example
```
TUNNEL_PORT=3001
API_KEYS_FILE=./keys.json
```

### 8. Run npm install and verify
```bash
npm install
npm run build   # should compile all packages
```

## Todo List
- [x] Create root package.json with workspaces
- [x] Create tsconfig.base.json
- [x] Create packages/shared (package.json, tsconfig, src/index.ts)
- [x] Create packages/server (package.json, tsconfig, src/server.ts)
- [x] Create packages/client (package.json, tsconfig, src/cli.ts)
- [x] Create .gitignore
- [x] Create .env.example
- [x] Create README.md
- [x] Run npm install — verify workspace linking
- [x] Run npm run build — verify TS compiles
- [x] Initialize git repo, first commit

## Success Criteria
- `npm install` completes without errors
- `npm run build` compiles all 3 packages
- `npm run dev:server` starts server placeholder
- Cross-package import works (server imports from shared)

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| npm workspace linking issues | Use `*` version for workspace deps |
| TS path resolution between packages | Use NodeNext module resolution + project references |
| Node.js version incompatibility | Enforce `engines` field in root package.json |
