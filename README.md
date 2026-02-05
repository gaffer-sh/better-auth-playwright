# better-auth-playwright

Test data management for [Better Auth](https://www.better-auth.com/) and [Playwright](https://playwright.dev/). Create users, sessions, and related resources in your E2E tests — with automatic cleanup.

## Features

- **Direct DB user creation** — bypasses sign-up flow for fast tests (password hashing only when needed)
- **Auto session cookies** — sets session cookies on the Playwright browser context automatically
- **Automatic cleanup** — all test users are deleted after each test
- **Plugin system** — extend user creation with additional resources (orgs, API keys, etc.)
- **Custom base test** — works with framework-specific Playwright extensions (Nuxt, Next.js, etc.)

## Install

```bash
npm install better-auth-playwright
```

Peer dependencies: `better-auth` (>=1.4.0) and `@playwright/test` (>=1.40.0).

## Quick Start

### 1. Server Setup

Add `testPlugin()` to your Better Auth config. The plugin registers test-only endpoints that are protected by a shared secret — when no secret is configured, they return 404.

```ts
// auth.ts (server)
import { betterAuth } from 'better-auth'
import { testPlugin } from 'better-auth-playwright/server'

export const auth = betterAuth({
  // ... your config
  plugins: [
    testPlugin({
      secret: process.env.TEST_DATA_SECRET,
    }),
  ],
})
```

### 2. Playwright Setup

Create a test fixtures file that configures `better-auth-playwright` with the same secret:

```ts
// e2e/fixtures.ts
import { createTestFixtures } from 'better-auth-playwright'

export const test = createTestFixtures({
  secret: process.env.TEST_DATA_SECRET!,
})

export { expect } from 'better-auth-playwright'
```

### 3. Write Tests

Use the `auth` fixture to create users and get authenticated browser sessions:

```ts
// e2e/dashboard.spec.ts
import { expect, test } from './fixtures'

test('user can see the dashboard', async ({ page, auth }) => {
  const user = await auth.createUser()
  // Browser context now has session cookies set

  await page.goto('/dashboard')
  await expect(page.getByText(user.email)).toBeVisible()
})
```

## API Reference

### Server

#### `testPlugin(options?)`

Better Auth plugin that registers test data endpoints. Import from `better-auth-playwright/server`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | `process.env.TEST_DATA_SECRET` | Secret required in `X-Test-Secret` header. If not set and env var is missing, endpoints return 404 (disabled). |
| `plugins` | `TestDataPlugin[]` | `[]` | Test data plugins that extend user creation with plugin-specific resources. |

**Registered endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/test-data/user` | Create a test user + session. Runs plugin hooks. |
| `DELETE` | `/api/auth/test-data/user` | Delete a test user by email. Runs plugin cleanup in reverse order. |
| `GET` | `/api/auth/test-data/capabilities` | List installed test data plugins and detected Better Auth plugins. |

All endpoints require the `X-Test-Secret` header and use `isAction: false` (not callable from the client SDK).

#### `organizationTest(defaults?)`

Test data plugin for the Better Auth `organization` plugin. Import from `better-auth-playwright/server`.

Creates an organization and membership when a test user is created. Automatically deletes the org on cleanup.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"{user.name}'s Org"` | Organization name. |
| `slug` | `string` | Slugified email prefix | Organization slug. |
| `role` | `'owner' \| 'admin' \| 'member'` | `'owner'` | User's role in the org. |
| `skip` | `boolean` | `false` | Skip org creation entirely. |

Returns `{ id, name, slug }` or `null` if skipped.

**Example with organization plugin:**

```ts
// auth.ts (server)
import { betterAuth } from 'better-auth'
import { organizationTest, testPlugin } from 'better-auth-playwright/server'
import { organization } from 'better-auth/plugins'

export const auth = betterAuth({
  plugins: [
    organization(),
    testPlugin({
      secret: process.env.TEST_DATA_SECRET,
      plugins: [organizationTest()],
    }),
  ],
})
```

### Playwright

#### `createTestFixtures(config)`

Creates a Playwright `test` object with an `auth` fixture. Import from `better-auth-playwright`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | *required* | Secret that matches the server plugin's secret. |
| `basePath` | `string` | `'/api/auth'` | Base path for Better Auth endpoints. |
| `test` | `TestType` | `@playwright/test`'s `test` | Custom base test to extend (see [Custom Base Test](#custom-base-test)). |

Returns a Playwright `test` function with the `auth` fixture added.

#### `auth.createUser(options?)`

Create a test user and set session cookies on the current browser context.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `email` | `string` | Random `test-*@test.local` | User's email address. |
| `name` | `string` | Email prefix | User's display name. |
| `password` | `string` | *none* | Set a password (only needed if the test exercises the login form). |
| `pluginData` | `Record<string, unknown>` | `{}` | Plugin-specific options, keyed by plugin ID. |

Returns a `TestUser`:

```ts
interface TestUser {
  id: string
  email: string
  name: string
  session: { id: string, token: string }
  plugins: Record<string, unknown>
}
```

#### `auth.cleanup(email)`

Delete a test user by email. Called automatically after each test for all users created during that test — you only need to call this manually for users created outside the fixture.

## Writing Plugins

Create custom test data plugins to extend user creation for other Better Auth plugins:

```ts
import type { CreateUserContext, TestDataPlugin } from 'better-auth-playwright'

interface MyPluginOptions {
  someOption?: string
}

interface MyPluginResult {
  resourceId: string
}

export function myPlugin(): TestDataPlugin<'my-plugin', MyPluginOptions, MyPluginResult> {
  return {
    id: 'my-plugin', // Must match the Better Auth plugin ID

    async onCreateUser(ctx: CreateUserContext, options: MyPluginOptions) {
      // ctx.authContext — Better Auth context (access adapters, options, etc.)
      // ctx.user — the created user
      // ctx.session — the created session
      // ctx.request — the original request

      // Create your resources...
      return { resourceId: '...' }
    },

    async onDeleteUser(ctx, user) {
      // Optional: clean up resources when user is deleted
    },
  }
}
```

Then register it in the server plugin:

```ts
testPlugin({
  secret: process.env.TEST_DATA_SECRET,
  plugins: [myPlugin()],
})
```

Access plugin results in tests via `user.plugins['my-plugin']`.

## Custom Base Test

If you use a framework-specific Playwright extension (like `@nuxt/test-utils/playwright`), pass its `test` function to preserve its fixtures:

```ts
import { test as nuxtTest } from '@nuxt/test-utils/playwright'
import { createTestFixtures } from 'better-auth-playwright'

export const test = createTestFixtures({
  secret: process.env.TEST_DATA_SECRET!,
  test: nuxtTest,
})

export { expect } from 'better-auth-playwright'
```

## Credit

Built by the team behind [Gaffer](https://gaffer.sh) — test reporting and analytics for CI/CD.

## License

MIT
