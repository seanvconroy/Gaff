import type { SocialProvider } from '@/domain/auth/email-authority';
import { offeredProviders } from '@/server/auth/providers';
import { ProviderButton } from '@/ui/ProviderButton';
import { continueWithProvider } from './provider-actions';
import { QuickWays } from './sign-in/PasskeySignIn';

/**
 * AU1, AU3, AU6: the quick ways in, above the email form: Google and Apple, where they're set
 * up, and a passkey, where the browser can use one. Each provider is a small form of its own,
 * so it works without JavaScript. `only` narrows the providers to the ones an account has.
 * `passkeyAutofill` also offers passkeys in the email box's suggestions (the sign-in page).
 */
export function ProviderButtons({
  next,
  passkeys = false,
  passkeyAutofill = false,
  only,
}: {
  next?: string;
  passkeys?: boolean;
  passkeyAutofill?: boolean;
  only?: readonly SocialProvider[];
}) {
  const providers = offeredProviders().filter((provider) => !only || only.includes(provider));
  return (
    <QuickWays
      hasProviders={providers.length > 0}
      passkeys={passkeys}
      passkeyAutofill={passkeyAutofill}
      next={next ?? '/'}
    >
      {providers.map((provider) => (
        <form key={provider} action={continueWithProvider.bind(null, provider)}>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <ProviderButton provider={provider} />
        </form>
      ))}
    </QuickWays>
  );
}
