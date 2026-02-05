import { describe, expect, it } from 'vitest'
import { organizationTest } from '../../src/plugins/organization.js'

describe('organizationTest', () => {
  it('returns a plugin with id "organization"', () => {
    const plugin = organizationTest()
    expect(plugin.id).toBe('organization')
  })

  it('has onCreateUser and onDeleteUser methods', () => {
    const plugin = organizationTest()
    expect(typeof plugin.onCreateUser).toBe('function')
    expect(typeof plugin.onDeleteUser).toBe('function')
  })

  it('returns null when skip: true', async () => {
    const plugin = organizationTest()
    const result = await plugin.onCreateUser(
      {} as any,
      { skip: true },
    )
    expect(result).toBeNull()
  })

  it('returns null when defaults have skip: true', async () => {
    const plugin = organizationTest({ skip: true })
    const result = await plugin.onCreateUser(
      {} as any,
      {},
    )
    expect(result).toBeNull()
  })

  it('per-call options override defaults', async () => {
    const plugin = organizationTest({ skip: true })
    // skip: false overrides skip: true — will attempt the real path and throw
    // because there's no auth context, proving the merge happened
    await expect(
      plugin.onCreateUser({} as any, { skip: false }),
    ).rejects.toThrow()
  })
})
