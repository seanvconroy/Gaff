import { eq } from 'drizzle-orm';
import { withPerson } from '@/db/client';
import { accounts, passkeys } from '@/db/schema';
import { signInProviderSchema, type SignInMethod } from '@/domain/auth/methods';

/**
 * Profile, "Sign-in": how a person signs in. A code by email always works for the address they
 * sign in with; Google and Apple once they've used them; and how many passkeys they have. Their
 * own rows, read for themselves alone.
 */
export async function signInMethodsOf(
  userId: string,
): Promise<{ methods: SignInMethod[]; passkeys: number }> {
  return withPerson(userId, async (tx) => {
    const linked = await tx
      .select({ provider: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const keys = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(eq(passkeys.userId, userId));
    const providers = new Set(
      linked.flatMap((row) => {
        const provider = signInProviderSchema.safeParse(row.provider);
        return provider.success ? [provider.data] : [];
      }),
    );
    return {
      methods: ['email_code', ...[...providers].sort()],
      passkeys: keys.length,
    };
  });
}
