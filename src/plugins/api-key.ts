import type { AuthContext, User } from 'better-auth'
import type { CreateUserContext, TestDataPlugin } from '../types.js'

export interface ApiKeyTestOptions {
  /** Key display name. Defaults to "test-key" */
  name?: string
  /** Key prefix, e.g. "sk_test_" */
  prefix?: string
  /** TTL in seconds. Omit for no expiry. */
  expiresIn?: number
  /** Request quota. Omit for unlimited. */
  remaining?: number
  /** Arbitrary metadata stored alongside the key */
  metadata?: Record<string, unknown>
  /** Permission scopes for the key */
  permissions?: Record<string, string[]>
  /** Skip API key creation entirely */
  skip?: boolean
}

export interface ApiKeyTestResult {
  id: string
  /** The raw unhashed key — only available at creation time */
  key: string
  /** The key prefix plus the first 5 characters of the random portion (for display/identification) */
  start: string
  prefix: string
  userId: string
  name: string
  expiresAt: Date | null
}

function generateRawKey(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  // Base64url encode (no padding) for URL-safe key — 32 bytes yields ~43 chars
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importApiKeyPlugin(): Promise<typeof import('better-auth/plugins')> {
  try {
    return await import('better-auth/plugins')
  }
  catch (err) {
    throw new Error(
      'better-auth-playwright: apiKeyTest requires the api-key plugin from better-auth. '
      + 'Ensure better-auth is installed and includes the api-key plugin exports.',
      { cause: err },
    )
  }
}

export function apiKeyTest(
  defaults?: ApiKeyTestOptions,
): TestDataPlugin<'api-key', ApiKeyTestOptions, ApiKeyTestResult | null> {
  return {
    id: 'api-key',

    async onCreateUser(ctx: CreateUserContext, opts: ApiKeyTestOptions) {
      const options = { ...defaults, ...opts }

      if (options.skip)
        return null

      const { defaultKeyHasher, API_KEY_TABLE_NAME } = await importApiKeyPlugin()

      const prefix = options.prefix ?? ''
      const rawKey = `${prefix}${generateRawKey()}`
      const hashedKey = await defaultKeyHasher(rawKey)
      const name = options.name ?? 'test-key'
      const start = rawKey.slice(0, prefix.length + 5)

      const expiresAt = options.expiresIn != null
        ? new Date(Date.now() + options.expiresIn * 1000)
        : null

      const record = await ctx.authContext.adapter.create<{ id: string }>({
        model: API_KEY_TABLE_NAME,
        data: {
          name,
          start,
          prefix,
          key: hashedKey,
          userId: ctx.user.id,
          expiresAt,
          remaining: options.remaining ?? null,
          enabled: true,
          createdAt: new Date(),
          metadata: options.metadata ? JSON.stringify(options.metadata) : null,
          permissions: options.permissions ? JSON.stringify(options.permissions) : null,
        },
      })

      return {
        id: record.id,
        key: rawKey,
        start,
        prefix,
        userId: ctx.user.id,
        name,
        expiresAt,
      }
    },

    async onDeleteUser(ctx: AuthContext, user: User) {
      const { API_KEY_TABLE_NAME } = await importApiKeyPlugin()

      try {
        const keys = await ctx.adapter.findMany<{ id: string }>({
          model: API_KEY_TABLE_NAME,
          where: [{ field: 'userId', value: user.id }],
        })
        for (const key of keys) {
          await ctx.adapter.delete({
            model: API_KEY_TABLE_NAME,
            where: [{ field: 'id', value: key.id }],
          })
        }
      }
      catch {
        // Best-effort cleanup: the apikey schema declares onDelete: "cascade"
        // on userId, so rows may already be gone after user deletion.
        // Adapter errors here (e.g., "row not found") are expected in that case.
      }
    },
  }
}
