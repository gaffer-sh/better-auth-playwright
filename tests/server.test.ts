import { describe, expect, it } from 'vitest'
import { testPlugin } from '../src/server.js'

describe('testPlugin', () => {
  it('returns a plugin with id "test"', () => {
    const plugin = testPlugin()
    expect(plugin.id).toBe('test')
  })

  it('registers expected endpoints', () => {
    const plugin = testPlugin()
    expect(plugin.endpoints).toHaveProperty('createTestUser')
    expect(plugin.endpoints).toHaveProperty('deleteTestUser')
    expect(plugin.endpoints).toHaveProperty('getTestCapabilities')
  })

  it('works with empty options', () => {
    const plugin = testPlugin({})
    expect(plugin.id).toBe('test')
    expect(plugin.endpoints).toBeDefined()
  })

  it('accepts test data plugins array', () => {
    const mockPlugin = {
      id: 'mock',
      onCreateUser: async () => ({ created: true }),
    }
    const plugin = testPlugin({ plugins: [mockPlugin] })
    expect(plugin.id).toBe('test')
    expect(plugin.endpoints).toBeDefined()
  })
})
