import { describe, expect, it, vi } from 'vitest'
import { apiKeyTest } from '../../src/plugins/api-key.js'

// Mock better-auth/plugins to avoid needing a real auth context
vi.mock('better-auth/plugins', () => ({
  defaultKeyHasher: async (key: string) => `hashed:${key}`,
  API_KEY_TABLE_NAME: 'apikey',
}))

function mockCreateUserContext(overrides: Record<string, unknown> = {}) {
  return {
    authContext: {
      adapter: {
        create: async (args: any) => ({
          id: 'generated-id',
          ...args.data,
        }),
      },
    },
    user: { id: 'user-1', email: 'test@test.local', name: 'Test' },
    session: { id: 'session-1', token: 'token-1' },
    request: new Request('http://localhost'),
    ...overrides,
  } as any
}

describe('apiKeyTest', () => {
  it('returns a plugin with id "api-key"', () => {
    const plugin = apiKeyTest()
    expect(plugin.id).toBe('api-key')
  })

  it('has onCreateUser and onDeleteUser methods', () => {
    const plugin = apiKeyTest()
    expect(typeof plugin.onCreateUser).toBe('function')
    expect(typeof plugin.onDeleteUser).toBe('function')
  })

  it('returns null when skip: true', async () => {
    const plugin = apiKeyTest()
    const result = await plugin.onCreateUser({} as any, { skip: true })
    expect(result).toBeNull()
  })

  it('returns null when defaults have skip: true', async () => {
    const plugin = apiKeyTest({ skip: true })
    const result = await plugin.onCreateUser({} as any, {})
    expect(result).toBeNull()
  })

  it('per-call options override defaults', async () => {
    const plugin = apiKeyTest({ skip: true, name: 'default-name' })
    const ctx = mockCreateUserContext()
    const result = await plugin.onCreateUser(ctx, { skip: false, name: 'override-name' })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('override-name')
  })

  it('generates URL-safe base64 keys without padding', async () => {
    const plugin = apiKeyTest()
    const ctx = mockCreateUserContext()
    const result = await plugin.onCreateUser(ctx, {})
    expect(result).not.toBeNull()
    expect(result!.key).toMatch(/^[\w-]+$/)
    expect(result!.key).not.toContain('+')
    expect(result!.key).not.toContain('/')
    expect(result!.key).not.toContain('=')
  })

  it('prepends prefix to the raw key', async () => {
    const plugin = apiKeyTest()
    const ctx = mockCreateUserContext()
    const result = await plugin.onCreateUser(ctx, { prefix: 'sk_test_' })
    expect(result).not.toBeNull()
    expect(result!.key).toMatch(/^sk_test_/)
    expect(result!.prefix).toBe('sk_test_')
  })

  it('computes start as prefix + 5 chars of the random portion', async () => {
    const plugin = apiKeyTest()
    const ctx = mockCreateUserContext()
    const result = await plugin.onCreateUser(ctx, { prefix: 'sk_' })
    expect(result).not.toBeNull()
    // start should be first prefix.length + 5 characters of key
    expect(result!.start).toBe(result!.key.slice(0, 3 + 5))
    expect(result!.start.length).toBe(8)
  })

  it('sets expiresAt from expiresIn in seconds', async () => {
    const plugin = apiKeyTest()
    const ctx = mockCreateUserContext()
    const before = Date.now()
    const result = await plugin.onCreateUser(ctx, { expiresIn: 3600 })
    const after = Date.now()
    expect(result).not.toBeNull()
    expect(result!.expiresAt).toBeInstanceOf(Date)
    const expiry = result!.expiresAt!.getTime()
    expect(expiry).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(expiry).toBeLessThanOrEqual(after + 3600 * 1000)
  })

  it('sets expiresAt to null when expiresIn is omitted', async () => {
    const plugin = apiKeyTest()
    const ctx = mockCreateUserContext()
    const result = await plugin.onCreateUser(ctx, {})
    expect(result).not.toBeNull()
    expect(result!.expiresAt).toBeNull()
  })

  it('applies default options', async () => {
    const plugin = apiKeyTest({ name: 'my-default', prefix: 'pk_' })
    const ctx = mockCreateUserContext()
    const result = await plugin.onCreateUser(ctx, {})
    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-default')
    expect(result!.prefix).toBe('pk_')
  })

  it('onDeleteUser does not throw when adapter errors', async () => {
    const plugin = apiKeyTest()
    const ctx = {
      adapter: {
        findMany: async () => { throw new Error('table not found') },
      },
    } as any
    await expect(
      plugin.onDeleteUser!(ctx, { id: 'u1' } as any),
    ).resolves.toBeUndefined()
  })
})
