'use client';

import { useFormStatus } from 'react-dom';
import { buttonClass } from './Button';
import styles from './ProviderButton.module.css';

/*
 * Google's and Apple's own marks, drawn as each one's brand rules ask: Google's "G" keeps its
 * four colours on any background; Apple's logo takes the text's colour, black on a light
 * button and white on a dark one. They're the providers' marks, not Gaff's styling, so their
 * colours aren't design tokens.
 */
function GoogleMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  );
}

const providers = {
  google: { name: 'Google', Mark: GoogleMark },
  apple: { name: 'Apple', Mark: AppleMark },
} as const;

/**
 * "Continue with Google" or "Continue with Apple" (AU1, AU3): a secondary button with the
 * provider's own mark, the same size for both, as Apple's rules ask. It submits the form it's
 * in. `verb` is "Connect" on How you sign in.
 */
export function ProviderButton({
  provider,
  verb = 'Continue with',
}: {
  provider: keyof typeof providers;
  verb?: 'Continue with' | 'Connect';
}) {
  const { pending } = useFormStatus();
  const { name, Mark } = providers[provider];
  return (
    <button
      type="submit"
      className={buttonClass('secondary', true)}
      aria-disabled={pending}
      disabled={pending}
    >
      <Mark />
      {pending ? `Opening ${name}…` : `${verb} ${name}`}
    </button>
  );
}
