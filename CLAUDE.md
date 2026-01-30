# better-auth-playwright

E2E testing plugin for Better Auth — fast user creation and automatic session cookies for Playwright.

## Build

- **Build tool**: tsdown (NOT tsup) — `pnpm build` / `pnpm dev`
- **ESM-first**: `"type": "module"`, `.mjs` outputs
- **Two entry points**: `src/index.ts` (Playwright fixtures), `src/server.ts` (Better Auth plugin)
- tsdown `exports: true` manages package.json exports — don't edit `exports` field manually

## TypeScript

- Strict mode, `verbatimModuleSyntax`, `moduleResolution: "bundler"`
- Target: ES2022

## Dependencies

- **Peer deps**: `better-auth` (server side), `@playwright/test` (test side) — both optional
- **Externals**: `better-auth`, `better-auth/plugins`, `@playwright/test`, `zod`

## Reference

- `better-auth-playwright.md` is the design doc
