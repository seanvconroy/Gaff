import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';

/**
 * AU6: Better Auth's browser client, for passkeys only. A passkey is made and used by the
 * browser itself (WebAuthn), so this is the one part of sign-in that needs JavaScript; every
 * other step is a form posted to the server. Only passkey components import this.
 */
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
