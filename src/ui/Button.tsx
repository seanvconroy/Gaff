import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Button.module.css';

/**
 * `primary` is ink, and there is one per view (UX-DS-2). `secondary` and `quiet` are never a
 * screen's main action. `destructive` is only for an action that deletes or cancels something.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';

/** `true` spans the column at every width; `'phone'` spans it below 900px and fits its label above. */
export type ButtonWidth = boolean | 'phone';

export function buttonClass(variant: ButtonVariant, fullWidth: ButtonWidth = false): string {
  return [
    styles.button,
    styles[variant],
    fullWidth === 'phone' ? styles.fullWidthOnPhone : fullWidth ? styles.fullWidth : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Every button is 48px high, wherever it is (UX-DS-13). */
export function Button({
  variant = 'secondary',
  fullWidth,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'style'> & {
  variant?: ButtonVariant;
  fullWidth?: ButtonWidth;
}) {
  return <button type={type} {...props} className={buttonClass(variant, fullWidth)} />;
}

export function ButtonLink({
  href,
  variant = 'secondary',
  fullWidth,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  fullWidth?: ButtonWidth;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, fullWidth)}>
      {children}
    </Link>
  );
}
