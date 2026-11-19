import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { standInPath } from '@/adapters/sign-in/stand-in';
import { signInProviderSchema } from '@/domain/auth/methods';
import { env } from '@/lib/env';
import { signInProviderModes } from '@/server/auth/auth';
import { Button } from '@/ui/Button';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import styles from '../../outbox/outbox.module.css';

export const metadata: Metadata = { title: 'Stand-in sign-in' };
export const dynamic = 'force-dynamic';

const names = { google: 'Google', apple: 'Apple' } as const;

/**
 * Development and tests only (DEV_TOOLS=1, never the test copy: BA-1): stands in for Google's
 * and Apple's own sign-in pages until real credentials are set (rule 10: nothing needs a real account to build). The
 * real page asks the person to pick their account; here, a tester says who is signing in.
 */
export default async function StandInSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ state?: string; redirect_uri?: string; problem?: string }>;
}) {
  const provider = signInProviderSchema.safeParse((await params).provider);
  if (!env().DEV_TOOLS || !provider.success) notFound();
  if (signInProviderModes()[provider.data] !== 'stand_in') notFound();
  const { state, redirect_uri: redirectUri, problem } = await searchParams;
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
        {/* A plain form to a route: the answer is a redirect, as the provider's own would be. */}
        <form method="post" action={`${standInPath(provider.data)}/answer`} noValidate>
          <input type="hidden" name="state" value={state} />
          <Stack gap={6}>
            <TextField name="name" label="Their name" autoComplete="off" defaultValue="Ann Power" />
            <TextField
              name="email"
              label={`Their ${name} email`}
              type="email"
              autoComplete="off"
              hint="Made up. Use the same address again to come back as the same person."
              error={problem ? 'Enter a name, and an email address like ann@example.ie' : undefined}
            />
            {provider.data === 'apple' ? (
              <ChoiceGroup
                name="hideEmail"
                type="checkbox"
                legend="Hide My Email"
                hideLegend
                options={[
                  {
                    value: 'yes',
                    label: 'Hide my email',
                    hint: 'Apple gives Gaff a relay address in place of the real one.',
                  },
                ]}
              />
            ) : (
              <ChoiceGroup
                name="notHosted"
                type="checkbox"
                legend="Who looks after the address"
                hideLegend
                options={[
                  {
                    value: 'yes',
                    label: 'Google doesn’t look after this address',
                    hint: 'A Google account made with a work address on another service. Gaff asks for a code first (AU4).',
                  },
                ]}
              />
            )}
            <Row>
              <Button type="submit" variant="primary" name="answer" value="continue">
                Continue
              </Button>
              <Button type="submit" name="answer" value="cancel">
                Cancel
              </Button>
            </Row>
          </Stack>
        </form>
      </Stack>
    </main>
  );
}
