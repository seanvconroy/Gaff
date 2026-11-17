/**
 * Before upload, the browser re-draws a photo the right way up, at most 1600 pixels across, as a
 * JPEG. A re-drawn photo carries no location or camera details, and is small enough to send from
 * a phone (R25, UX-LT-10). If that can't be done, the original goes, and the server strips it.
 */
export const PHOTO_MAX_EDGE = 1600;

export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
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
