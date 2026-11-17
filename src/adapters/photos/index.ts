import { env } from '@/lib/env';
import type { PhotoStore } from '@/ports/photo-store';
import { localPhotoStore } from './local';
import { supabasePhotoStore } from './supabase';

/** UX-LT-10: the photo store in use (PHOTO_STORE). */
export function photoStore(): PhotoStore {
  const config = env();
  if (config.PHOTO_STORE === 'supabase') {
    return supabasePhotoStore({
      url: config.SUPABASE_URL!,
      serviceKey: config.SUPABASE_SERVICE_ROLE_KEY!,
      bucket: config.PHOTO_BUCKET,
    });
  }
  return localPhotoStore;
}
