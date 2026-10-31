import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export function buttonClass(variant: ButtonVariant, fullWidth = false): string {
  return [styles.button, styles[variant], fullWidth ? styles.fullWidth : '']
    .filter(Boolean)
    .join(' ');
}

/** One primary button per view (design system). */
export function Button({
  variant = 'secondary',
  fullWidth,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'style'> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
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
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, fullWidth)}>
      {children}
    </Link>
  );
}
