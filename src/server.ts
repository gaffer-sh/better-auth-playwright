import type { BetterAuthPlugin } from 'better-auth'
import type { CreateUserContext, TestDataPlugin } from './types.js'
import { setSessionCookie } from 'better-auth/cookies'
import { createAuthEndpoint } from 'better-auth/plugins'
import { z } from 'zod'

export { apiKeyTest, organizationTest } from './plugins/index.js'
export type { CreateUserContext, TestDataPlugin } from './types.js'

interface TestPluginOptions {
  /**
   * Test data plugins that extend user creation with
   * plugin-specific resources (orgs, API keys, etc.)
   */
  plugins?: TestDataPlugin<any, any, any>[]

  /**
   * Secret required in X-Test-Secret header.
   * If not set, uses TEST_DATA_SECRET env var.
   * If neither is set, endpoints return 404 (disabled).
   */
  secret?: string
}

export function testPlugin(options: TestPluginOptions = {}): BetterAuthPlugin {
  // eslint-disable-next-line node/prefer-global/process
  const secret = options.secret ?? process.env.TEST_DATA_SECRET
  const testPlugins = options.plugins ?? []

  return {
    id: 'test',

    endpoints: {
      createTestUser: createAuthEndpoint(
        '/test-data/user',
        {
          method: 'POST',
          body: z.object({
            email: z.string().email(),
            name: z.string().optional(),
            password: z.string().optional(),
            pluginData: z.record(z.string(), z.any()).optional(),
          }),
          metadata: { isAction: false },
        },
        async (ctx) => {
          if (!secret)
            return ctx.json(null, { status: 404 })
          const headerSecret = ctx.headers?.get('x-test-secret')
          if (headerSecret !== secret) {
            return ctx.json({ error: 'Unauthorized' }, { status: 401 })
          }

          const adapter = ctx.context.internalAdapter
          const email = ctx.body.email
          const name = ctx.body.name ?? email.split('@')[0]

          // 1. Create user (no hashing, no sign-up flow)
          const user = await adapter.createUser({
            email,
            name,
            emailVerified: true,
          })

          // 2. Optionally create credential account with hashed password
          if (ctx.body.password) {
            const hash = await ctx.context.password.hash(ctx.body.password)
            await adapter.createAccount({
              userId: user.id,
              providerId: 'credential',
              accountId: user.id,
              password: hash,
            })
          }

          // 3. Create session directly (bypasses auth flow)
          const session = await adapter.createSession(user.id)

          // 4. Run test data plugins (may update session, e.g. activeOrganizationId)
          const pluginResults: Record<string, unknown> = {}
          for (const plugin of testPlugins) {
            const pluginOpts = ctx.body.pluginData?.[plugin.id] ?? {}
            const pluginCtx: CreateUserContext = {
              authContext: ctx.context,
              user,
              session,
              request: ctx.request!,
            }
            pluginResults[plugin.id] = await plugin.onCreateUser(
              pluginCtx,
              pluginOpts,
            )
          }

          // 5. Re-fetch session after plugins (plugins may have updated it,
          //    e.g. organizationTest sets activeOrganizationId).
          //    This ensures the cookie contains the final session state,
          //    which matters when cookie caching is enabled.
          const finalSession = await adapter.findSession(session.token)

          // 6. Set signed session cookie AFTER plugins so cached cookie
          //    includes all plugin-added fields (e.g. activeOrganizationId)
          await setSessionCookie(ctx, {
            session: finalSession?.session ?? session,
            user,
          })

          // 7. Return everything the Playwright side needs
          return ctx.json({
            user: { id: user.id, email: user.email, name: user.name },
            session: { id: session.id, token: session.token },
            plugins: pluginResults,
          })
        },
      ),

      deleteTestUser: createAuthEndpoint(
        '/test-data/user',
        {
          method: 'DELETE',
          body: z.object({
            email: z.string().email(),
          }),
          metadata: { isAction: false },
        },
        async (ctx) => {
          if (!secret)
            return ctx.json(null, { status: 404 })
          const headerSecret = ctx.headers?.get('x-test-secret')
          if (headerSecret !== secret) {
            return ctx.json({ error: 'Unauthorized' }, { status: 401 })
          }

          const adapter = ctx.context.internalAdapter
          const found = await adapter.findUserByEmail(ctx.body.email)
          if (!found) {
            return ctx.json({ error: 'User not found' }, { status: 404 })
          }

          // Run plugin cleanup in reverse order
          for (const plugin of [...testPlugins].reverse()) {
            if (plugin.onDeleteUser) {
              await plugin.onDeleteUser(ctx.context, found.user)
            }
          }

          await adapter.deleteUser(found.user.id)
          return ctx.json({ success: true })
        },
      ),

      getTestCapabilities: createAuthEndpoint(
        '/test-data/capabilities',
        {
          method: 'GET',
          metadata: { isAction: false },
        },
        async (ctx) => {
          if (!secret)
            return ctx.json(null, { status: 404 })

          const installedBetterAuthPlugins = (
            ctx.context.options.plugins ?? []
          ).map(p => p.id)

          return ctx.json({
            plugins: testPlugins.map(p => p.id),
            detectedAuthPlugins: installedBetterAuthPlugins,
          })
        },
      ),
    },
  } satisfies BetterAuthPlugin
}
