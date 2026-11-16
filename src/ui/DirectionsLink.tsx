'use client';

import { MapPin } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { directionsHref, mapsPlatform, type MapsPlatform } from '@/domain/viewings/choosing';
import { buttonProps, type ButtonVariant, type ButtonWidth } from './Button';

const never = () => () => {};

/**
 * "Get directions" (UX-RN-8): a button that opens the phone's own maps app at an address. On
 * anything that isn't a phone it opens OpenStreetMap in a new tab. It starts as the web link,
 * which works anywhere, and becomes the phone's own once the page knows what it's on.
 */
export function DirectionsLink({
  address,
  variant = 'secondary',
  fullWidth,
  children,
}: {
  /** The home's address, as a maps app would search for it. */
  address: string;
  variant?: ButtonVariant;
  fullWidth?: ButtonWidth;
  children: ReactNode;
}) {
  const platform = useSyncExternalStore<MapsPlatform>(
    never,
    () => mapsPlatform(navigator.userAgent),
    () => 'other',
  );
  const web = platform === 'other';
  return (
    <a
      href={directionsHref(address, platform)}
      {...buttonProps(variant, fullWidth)}
      target={web ? '_blank' : undefined}
      rel={web ? 'noreferrer' : undefined}
    >
      <MapPin size={20} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </a>
  );
}
