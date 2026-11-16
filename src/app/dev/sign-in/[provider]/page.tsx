import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { signInProviderSchema } from '@/domain/auth/methods';
import { env } from '@/lib/env';
import { signInProviderModes } from '@/server/auth/auth';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../../outbox/outbox.module.css';
import { standInAnswer } from './actions';
import { StandInForm } from './StandInForm';

export const metadata: Metadata = { title: 'Stand-in sign-in' };
export const dynamic = 'force-dynamic';

const names = { google: 'Google', apple: 'Apple' } as const;

/**
 * Development and staging only (DEV_TOOLS=1): stands in for Google's and Apple's own sign-in
 * pages until real credentials are set (rule 10: nothing needs a real account to build). The
 * real page asks the person to pick their account; here, a tester says who is signing in.
 */
export default async function StandInSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ state?: string; redirect_uri?: string }>;
}) {
  const provider = signInProviderSchema.safeParse((await params).provider);
  if (!env().DEV_TOOLS || !provider.success) notFound();
  if (signInProviderModes()[provider.data] !== 'stand_in') notFound();
  const { state, redirect_uri: redirectUri } = await searchParams;
  // Only ever answers Gaff's own callback: never an open redirect.
  const callback = new URL(`/api/auth/callback/${provider.data}`, env().APP_URL).toString();
  if (!state || redirectUri !== callback) notFound();
  const name = names[provider.data];
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title={`Stand-in for ${name}`}
          lead={`The real ${name} asks the person to choose their account. Here, you say who is signing in.`}
        />
        <StandInForm
          provider={provider.data}
          name={name}
          action={standInAnswer.bind(null, provider.data, state)}
        />
      </Stack>
    </main>
  );
}
