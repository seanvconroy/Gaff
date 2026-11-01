'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { TextField } from './Field';

/**
 * A photo, taken or chosen on a phone. Before upload, the browser re-draws it the right way up,
 * at most 1600 pixels across, as a JPEG with no location or camera details (R25). If that can't
 * be done, the original goes, and the server strips it instead.
 */
async function redraw(event: ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) return;
    const files = new DataTransfer();
    files.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    input.files = files.files;
  } catch {
    // Keep the original: the server checks and strips it.
  }
}

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
