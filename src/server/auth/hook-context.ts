import type { createAuthMiddleware } from 'better-auth/api';

/** What Better Auth hands a hook: the call's route, body, headers and what it returned. */
export type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
