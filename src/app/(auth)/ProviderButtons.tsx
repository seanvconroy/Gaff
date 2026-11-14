import { offeredProviders } from '@/server/auth/providers';
import { Stack } from '@/ui/Layout';
import { ProviderButton } from '@/ui/ProviderButton';
import { TextDivider } from '@/ui/TextDivider';
import { continueWithProvider } from './provider-actions';

/**
 * AU1, AU3: Google and Apple, above the email form, where they're set up. Each is a small form
 * of its own, so it works without JavaScript. Nothing shows where neither is set up.
 */
export function ProviderButtons({ next }: { next?: string }) {
  const providers = offeredProviders();
  if (providers.length === 0) return null;
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        {providers.map((provider) => (
          <form key={provider} action={continueWithProvider.bind(null, provider)}>
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <ProviderButton provider={provider} />
          </form>
        ))}
      </Stack>
      <TextDivider>or use your email</TextDivider>
    </Stack>
  );
}
