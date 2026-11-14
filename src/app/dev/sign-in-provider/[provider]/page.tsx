import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { providerModes } from '@/server/auth/providers';
import { callbackUrl } from '@/server/auth/stand-in-provider';
import { buttonClass } from '@/ui/Button';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import styles from '../../outbox/outbox.module.css';

// A plain form post needs an Origin header, which the site-wide "no-referrer" leaves null.
export const metadata: Metadata = { title: 'Stand-in sign-in', referrer: 'same-origin' };
export const dynamic = 'force-dynamic';

const names = { google: 'Google', apple: 'Apple' } as const;

/**
 * Local development and tests only: stands in for Google's and Apple's own sign-in pages
 * (ADR-0028). You choose who to be, and what the provider says about the address; Gaff then
 * treats the answer as it would the real provider's. Never on the test copy or in production.
 */
export default async function StandInProviderPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{
    state?: string;
    redirect_uri?: string;
    code_challenge?: string;
    response_mode?: string;
  }>;
}) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'apple') notFound();
  if (providerModes()[provider] !== 'stand_in') notFound();
  const asked = await searchParams;
  // Like a real provider, it only sends people back to the address registered with it.
  if (!asked.state || asked.redirect_uri !== callbackUrl(provider)) notFound();
  const name = names[provider];
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title={`Stand-in for ${name}`}
          lead={`${name} would ask you to sign in here. Choose who to be, and what ${name} says about the address.`}
        />
        {/* A plain form to a route that answers with a redirect, as a real provider does. */}
        <form method="post" action={`/dev/sign-in-provider/${provider}/choose`}>
          <Stack gap={6}>
            <input type="hidden" name="state" value={asked.state} />
            <input type="hidden" name="code_challenge" value={asked.code_challenge ?? ''} />
            <input type="hidden" name="response_mode" value={asked.response_mode ?? ''} />
            <TextField
              name="email"
              label={`Email address of the ${name} account`}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              hint={
                provider === 'google'
                  ? 'Google hosts @gmail.com addresses, and Workspace addresses. It can only say it once checked any other.'
                  : 'Apple hosts @icloud.com addresses and Hide My Email. It can only say it once checked any other.'
              }
            />
            <TextField name="name" label="Name" defaultValue="Ann Power" />
            <ChoiceGroup
              name="says"
              type="checkbox"
              legend={`What ${name} says`}
              defaultValue={['verified']}
              options={[
                { value: 'verified', label: 'The email address is verified' },
                provider === 'google'
                  ? {
                      value: 'workspace',
                      label: 'It’s a Google Workspace account',
                      hint: 'So Google hosts the address, whatever its domain.',
                    }
                  : {
                      value: 'hidden',
                      label: 'Hide My Email',
                      hint: 'Gaff gets a relay address at privaterelay.appleid.com.',
                    },
              ]}
            />
            <Row>
              <button
                type="submit"
                name="answer"
                value="continue"
                className={buttonClass('primary')}
              >
                Continue as this person
              </button>
              <button
                type="submit"
                name="answer"
                value="cancel"
                formNoValidate
                className={buttonClass('secondary')}
              >
                Cancel
              </button>
            </Row>
          </Stack>
        </form>
      </Stack>
    </main>
  );
}
