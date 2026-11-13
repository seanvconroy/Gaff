'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import { Stack } from '@/ui/Layout';
import styles from './photo-uploader.module.css';

const MAX_SIDE = 2560;

/**
 * M43: before uploading, the browser redraws each photo the right way up, at most 2,560 pixels
 * across, as a JPEG: that also reads iPhone photos in browsers that can. The server checks and
 * cleans every photo again, whatever arrives.
 */
async function redraw(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

type Started =
  | {
      ok: true;
      mediaId: string;
      upload: { url: string; method: string; headers: Record<string, string> };
    }
  | { ok: false; problem: string };

/** M43: photos for a home, or for a development (M32); the server actions say which. */
export function PhotoUploader({
  start,
  finish,
  kind = 'photo',
  label,
}: {
  start: (file: {
    contentType: string;
    bytes: number;
    kind: 'photo' | 'floor_plan';
  }) => Promise<Started>;
  finish: (mediaId: string) => Promise<void>;
  kind?: 'photo' | 'floor_plan';
  label: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    let done = 0;
    const problems: string[] = [];
    for (const file of files) {
      setStatus(`Adding ${done + 1} of ${files.length}…`);
      const body = await redraw(file);
      const type = body.type || file.type;
      const started = await start({ contentType: type, bytes: body.size, kind });
      if (!started.ok) {
        problems.push(`${file.name}: ${started.problem}`);
        continue;
      }
      const response = await fetch(started.upload.url, {
        method: started.upload.method,
        headers: started.upload.headers,
        body,
      });
      if (!response.ok) {
        problems.push(`${file.name}: that didn’t upload. Try it again.`);
        continue;
      }
      await finish(started.mediaId);
      done += 1;
    }
    setStatus(
      [
        done > 0
          ? `${done} added. Gaff is checking and resizing them now: refresh in a moment to see them.`
          : '',
        ...problems,
      ]
        .filter(Boolean)
        .join(' '),
    );
    router.refresh();
  }

  const id = `upload-${kind}`;
  return (
    <Stack gap={2}>
      <label htmlFor={id} className={styles.uploadLabel}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        multiple={kind === 'photo'}
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        onChange={(event) => void upload(event)}
        className={styles.upload}
      />
      <p role="status" aria-live="polite" className={styles.saved}>
        {status}
      </p>
    </Stack>
  );
}
