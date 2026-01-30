import type { AuthContext, User } from 'better-auth'
import type { TestDataPlugin, CreateUserContext } from '../types.js'

interface OrgTestOptions {
  /** Organization name. Defaults to "{user.name}'s Org" */
  name?: string
  /** Organization slug. Defaults to slugified email prefix */
  slug?: string
  /** User's role in the org. Defaults to 'owner' */
  role?: 'owner' | 'admin' | 'member'
  /** Skip org creation entirely (for bare-user scenarios) */
  skip?: boolean
}

interface OrgTestResult {
  id: string
  name: string
  slug: string
}

export function organizationTest(
  defaults?: Partial<OrgTestOptions>,
): TestDataPlugin<'organization', OrgTestOptions, OrgTestResult | null> {
  async function getAdapter(ctx: AuthContext) {
    const { getOrgAdapter } = await import('better-auth/plugins')
    return getOrgAdapter(ctx)
  }

  return {
    id: 'organization',

    async onCreateUser(ctx: CreateUserContext, opts: OrgTestOptions) {
      const options = { ...defaults, ...opts }

      if (options.skip) return null

      const orgAdapter = await getAdapter(ctx.authContext)

      const name = options.name ?? `${ctx.user.name}'s Org`
      const slug =
        options.slug ??
        ctx.user.email
          .split('@')[0]
          .replace(/[^a-z0-9-]/g, '-')
      const role = options.role ?? 'owner'

      const org = await orgAdapter.createOrganization({
        organization: { name, slug, createdAt: new Date() },
      })

      await orgAdapter.createMember({
        organizationId: org.id,
        userId: ctx.user.id,
        role,
      })

      // Set active org on session so middleware doesn't redirect
      const adapter = ctx.authContext.internalAdapter
      await adapter.updateSession(ctx.session.token, {
        activeOrganizationId: org.id,
      })

      return { id: org.id, name: org.name, slug: org.slug }
    },

    async onDeleteUser(ctx: AuthContext, user: User) {
      const orgAdapter = await getAdapter(ctx)
      const orgs = await orgAdapter.listOrganizations(user.id)
      for (const org of orgs) {
        await orgAdapter.deleteOrganization(org.id)
      }
    },
  }
}
