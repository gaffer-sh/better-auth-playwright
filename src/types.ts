import type { AuthContext, Session, User } from 'better-auth'

export interface CreateUserContext {
  authContext: AuthContext
  user: User
  session: Session
  request: Request
}

/**
 * A test data plugin extends `createTestUser` with additional
 * resource creation for a specific Better Auth plugin.
 *
 * Example: `organizationTest()` creates an org + membership
 * when the `organization` plugin is installed.
 */
export interface TestDataPlugin<
  TId extends string = string,
  TOptions = unknown,
  TResult = unknown,
> {
  /** Must match the Better Auth plugin ID this extends */
  id: TId

  /** Called after user+session creation. Returns plugin-specific data. */
  onCreateUser: (ctx: CreateUserContext, options: TOptions) => Promise<TResult>

  /** Optional cleanup when test user is deleted. */
  onDeleteUser?: (ctx: AuthContext, user: User) => Promise<void>
}
