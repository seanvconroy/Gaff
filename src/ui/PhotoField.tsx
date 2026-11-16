'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { MAX_PHOTO_BYTES } from '@/domain/tenancy/photos';
import { TextField } from './Field';
import { shrinkPhoto } from './shrink-photo';

/** Said by the browser before upload, so a big photo never meets the server's size limit. */
const TOO_BIG = 'That photo is too big. Try one under 4 MB.';

/**
 * A photo, taken or chosen on a phone. Before upload, the browser re-draws it the right way up,
 * at most 1600 pixels across, as a JPEG with no location or camera details (R25). If that can't
 * be done, the original goes, and the server strips it instead.
 */
async function redraw(event: ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  await shrink(input);
  const size = input.files?.[0]?.size ?? 0;
  input.setCustomValidity(size > MAX_PHOTO_BYTES ? TOO_BIG : '');
  if (size > MAX_PHOTO_BYTES) input.reportValidity();
}

async function shrink(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file) return;
  const smaller = await shrinkPhoto(file);
  if (smaller === file) return;
  const files = new DataTransfer();
  files.items.add(smaller);
  input.files = files.files;
}

/** One photo. For a home's photos, many at once and in an order, use `PhotoUploader`. */
export function PhotoField({
  name,
  label,
  hint,
  error,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <TextField
      name={name}
      label={label}
      hint={hint}
      error={error}
      optional
      type="file"
      accept="image/jpeg,image/png,image/webp,image/*"
      onChange={(event) => void redraw(event)}
    />
  );
}
