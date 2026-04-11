import type { Page, TestType } from '@playwright/test'
import { test as defaultBase } from '@playwright/test'

interface CreateUserOptions {
  email?: string
  name?: string
  /**
   * Set a password for this user.
   * Only needed if the test exercises the login form.
   * Omit for faster tests that skip login entirely.
   */
  password?: string
  /** Plugin-specific options, keyed by plugin ID */
  pluginData?: Record<string, unknown>
}

type OAuthProvider = 'google' | 'github' | 'apple' | 'microsoft' | 'facebook' | 'twitter' | 'discord' | 'gitlab'

interface CreateOAuthUserOptions {
  /** OAuth provider to simulate (e.g. 'google', 'github') */
  provider: OAuthProvider
  email?: string
  name?: string
  /** Provider account ID. Auto-generated if omitted. */
  providerAccountId?: string
  /** Plugin-specific options, keyed by plugin ID */
  pluginData?: Record<string, unknown>
}

interface TestUser {
  id: string
  email: string
  name: string
  session: { id: string, token: string }
  /** Plugin-specific data, keyed by plugin ID */
  plugins: Record<string, unknown>
}

interface TestOAuthUser extends TestUser {
  account: { provider: OAuthProvider, providerAccountId: string }
}

interface TestAuth {
  /**
   * Create a test user and set session cookies on the current browser context.
   *
   * The user is created via internalAdapter (no password hashing unless
   * `password` is specified). A session is created directly in the DB
   * and the session cookie is set on the browser context.
   */
  createUser: (options?: CreateUserOptions) => Promise<TestUser>

  /**
   * Create a test OAuth user (Google, GitHub, etc) without going through the
   * real provider's auth flow. Uses internalAdapter.createOAuthUser, which
   * exercises the same database hooks as a real OAuth signup — including
   * databaseHooks.user.create.after AND databaseHooks.account.create.after
   * with the correct providerId. Use for testing OAuth-specific behavior in
   * your app's auth hooks.
   */
  createOAuthUser: (options: CreateOAuthUserOptions) => Promise<TestOAuthUser>

  /**
   * Delete a test user by email. Called automatically in teardown
   * for all users created during the test.
   */
  cleanup: (email: string) => Promise<void>
}

interface TestAuthFixtures {
  auth: TestAuth
}

export type { CreateOAuthUserOptions, CreateUserOptions, OAuthProvider, TestAuth, TestAuthFixtures, TestOAuthUser, TestUser }

/**
 * Create Playwright fixtures configured for your Better Auth app.
 *
 * @example
 * ```ts
 * // e2e/fixtures.ts
 * import { createTestFixtures } from 'better-auth-playwright'
 *
 * export const test = createTestFixtures({
 *   secret: process.env.TEST_DATA_SECRET!,
 * })
 *
 * export { expect } from '@playwright/test'
 * ```
 */
// eslint-disable-next-line ts/explicit-function-return-type
export function createTestFixtures(config: {
  /** Secret that matches the server plugin's secret */
  secret: string
  /**
   * Base path for Better Auth endpoints.
   * Defaults to '/api/auth'.
   */
  basePath?: string
  /**
   * Custom Playwright base test to extend.
   * Pass your framework's test (e.g. Nuxt's `test` from `@nuxt/test-utils/playwright`)
   * to preserve its fixtures while adding `auth`.
   * Defaults to `@playwright/test`'s `test`.
   */
  test?: TestType<any, any>
}) {
  const basePath = config.basePath ?? '/api/auth'
  const baseTest = config.test ?? defaultBase

  return baseTest.extend<TestAuthFixtures>({
    auth: async ({ page, baseURL }: { page: Page, baseURL: string | undefined }, use: (r: TestAuth) => Promise<void>) => {
      if (!baseURL) {
        throw new Error('baseURL must be configured in Playwright')
      }

      const verifiedBaseURL = baseURL
      const origin = verifiedBaseURL.replace(/\/+$/, '')
      const created: string[] = []
      const context = page.context()

      // Apply Set-Cookie headers from a fetch response onto the browser context
      async function applyCookiesFromResponse(res: Response): Promise<void> {
        const domain = new URL(verifiedBaseURL).hostname
        const setCookieHeaders = res.headers.getSetCookie()
        const cookies = setCookieHeaders.map((header) => {
          const [nameValue, ...attrs] = header.split(';')
          const [name, ...valueParts] = nameValue!.split('=')
          const value = valueParts.join('=')
          return {
            name: name!.trim(),
            value,
            domain,
            path: '/',
            httpOnly: attrs.some(a => a.trim().toLowerCase() === 'httponly'),
            secure: attrs.some(a => a.trim().toLowerCase() === 'secure'),
          }
        }).filter(c => c.name && c.value)
        if (cookies.length > 0) {
          await context.addCookies(cookies)
        }
      }

      const auth: TestAuth = {
        async createUser(options = {}) {
          const email
            = options.email
              ?? `test-${crypto.randomUUID().slice(0, 8)}@test.local`

          const res = await fetch(`${origin}${basePath}/test-data/user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Test-Secret': config.secret,
            },
            body: JSON.stringify({
              email,
              name: options.name,
              password: options.password,
              pluginData: options.pluginData,
            }),
          })

          if (!res.ok) {
            const error = await res.text()
            throw new Error(
              `better-auth-playwright: createUser failed (${res.status}): ${error}`,
            )
          }

          const data = (await res.json()) as {
            user: { id: string, email: string, name: string }
            session: { id: string, token: string }
            plugins: Record<string, unknown>
          }
          created.push(email)
          await applyCookiesFromResponse(res)

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            session: data.session,
            plugins: data.plugins,
          }
        },

        async createOAuthUser(options) {
          const email
            = options.email
              ?? `test-oauth-${crypto.randomUUID().slice(0, 8)}@test.local`

          const res = await fetch(`${origin}${basePath}/test-data/oauth-user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Test-Secret': config.secret,
            },
            body: JSON.stringify({
              email,
              name: options.name,
              provider: options.provider,
              providerAccountId: options.providerAccountId,
              pluginData: options.pluginData,
            }),
          })

          if (!res.ok) {
            const error = await res.text()
            throw new Error(
              `better-auth-playwright: createOAuthUser failed (${res.status}): ${error}`,
            )
          }

          const data = (await res.json()) as {
            user: { id: string, email: string, name: string }
            session: { id: string, token: string }
            account: { provider: OAuthProvider, providerAccountId: string }
            plugins: Record<string, unknown>
          }
          created.push(email)
          await applyCookiesFromResponse(res)

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            session: data.session,
            account: data.account,
            plugins: data.plugins,
          }
        },

        async cleanup(email: string) {
          try {
            const res = await fetch(`${origin}${basePath}/test-data/delete-user`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Test-Secret': config.secret,
              },
              body: JSON.stringify({ email }),
            })
            if (!res.ok) {
              console.warn(
                `[better-auth-playwright] cleanup failed for ${email}: `
                + `${res.status} ${res.statusText}`,
              )
            }
            else {
              const body = await res.json() as { success: boolean, warnings?: string[] }
              if (body.warnings?.length) {
                console.warn(
                  `[better-auth-playwright] cleanup warnings for ${email}:`,
                  body.warnings.join('; '),
                )
              }
            }
          }
          catch (err) {
            console.warn(
              `[better-auth-playwright] cleanup failed for ${email}:`,
              err instanceof Error ? err.message : err,
            )
          }
        },
      }

      await use(auth)

      // Auto-cleanup all created users after test
      for (const email of created) {
        await auth.cleanup(email)
      }
    },
  })
}
