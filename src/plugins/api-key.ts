import type { AuthContext, User } from 'better-auth'
import type { CreateUserContext, TestDataPlugin } from '../types.js'

interface ApiKeyTestOptions {
  /** Key display name. Defaults to "test-key" */
  name?: string
  /** Key prefix, e.g. "sk_test_" */
  prefix?: string
  /** TTL in seconds. `null` = no expiry */
  expiresIn?: number | null
  /** Request quota. `null` = unlimited */
  remaining?: number | null
  /** Arbitrary metadata stored alongside the key */
  metadata?: Record<string, unknown>
  /** Permission scopes for the key */
  permissions?: Record<string, string[]>
  /** Skip API key creation entirely */
  skip?: boolean
}

interface ApiKeyTestResult {
  id: string
  /** The raw unhashed key — only available at creation time */
  key: string
  /** First characters of the key (for display) */
  start: string
  prefix: string
  userId: string
  name: string
  expiresAt: Date | null
}

function generateRawKey(length = 32): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  // Base64url encode (no padding) for URL-safe key
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function apiKeyTest(
  defaults?: Partial<ApiKeyTestOptions>,
): TestDataPlugin<'api-key', ApiKeyTestOptions, ApiKeyTestResult | null> {
  return {
    id: 'api-key',

    async onCreateUser(ctx: CreateUserContext, opts: ApiKeyTestOptions) {
      const options = { ...defaults, ...opts }

      if (options.skip)
        return null

      const { defaultKeyHasher, API_KEY_TABLE_NAME } = await import('better-auth/plugins')

      const prefix = options.prefix ?? ''
      const rawKey = `${prefix}${generateRawKey()}`
      const hashedKey = await defaultKeyHasher(rawKey)
      const name = options.name ?? 'test-key'
      const start = rawKey.slice(0, prefix.length + 5)

      const expiresAt = options.expiresIn != null
        ? new Date(Date.now() + options.expiresIn * 1000)
        : null

      const record = await ctx.authContext.adapter.create<{
        id: string
        key: string
        start: string
        prefix: string
        userId: string
        name: string
        expiresAt: Date | null
        remaining: number | null
        metadata: string | null
        permissions: string | null
        enabled: boolean
        createdAt: Date
      }>({
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
      try {
        const { API_KEY_TABLE_NAME } = await import('better-auth/plugins')
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
        // Best-effort: apikey table has onDelete: "cascade" on userId,
        // so keys are typically auto-deleted by the DB.
      }
    },
  }
}
