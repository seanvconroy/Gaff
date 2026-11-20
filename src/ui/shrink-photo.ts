/**
 * Before upload, the browser re-draws a photo the right way up, at most 1600 pixels across, as a
 * JPEG. A re-drawn photo carries no location or camera details, and is small enough to send from
 * a phone (R25, UX-LT-10). If that can't be done, the original goes, and the server strips it.
 */
export const PHOTO_MAX_EDGE = 1600;

/**
 * M43: a home's photo is redrawn at up to 2,560 pixels, so the server can keep it at every fixed
 * width up to 2,048. It still comes in under 4 MB. Redrawing also reads an iPhone's HEIC photo in
 * a browser that can (Safari), which the server can't.
 */
export const HOME_PHOTO_MAX_EDGE = 2560;

export async function shrinkPhoto(file: File, maxEdge: number = PHOTO_MAX_EDGE): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    // Keep the original: the server checks and strips it.
    return file;
  }
}
