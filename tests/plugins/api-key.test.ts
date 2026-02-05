import { describe, expect, it } from 'vitest'
import { apiKeyTest } from '../../src/plugins/api-key.js'

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
    const result = await plugin.onCreateUser(
      {} as any,
      { skip: true },
    )
    expect(result).toBeNull()
  })

  it('returns null when defaults have skip: true', async () => {
    const plugin = apiKeyTest({ skip: true })
    const result = await plugin.onCreateUser(
      {} as any,
      {},
    )
    expect(result).toBeNull()
  })

  it('per-call options override defaults', async () => {
    const plugin = apiKeyTest({ skip: true })
    // skip: false in per-call should override skip: true in defaults
    // This will fail with a dynamic import error since we don't have a real auth context,
    // but it proves the merge happened (skip was overridden to false, so it didn't return null)
    await expect(
      plugin.onCreateUser({} as any, { skip: false }),
    ).rejects.toThrow()
  })
})
