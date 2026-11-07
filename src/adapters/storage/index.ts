import path from 'node:path';
import { env } from '@/lib/env';
import type { ObjectStorage } from '@/ports/storage';
import { localStorage } from './local';
import { supabaseStorage } from './supabase';

export function objectStorage(): ObjectStorage {
  const config = env();
  if (config.STORAGE_PROVIDER === 'supabase') {
    return supabaseStorage({
      url: config.SUPABASE_URL!,
      serviceKey: config.SUPABASE_SERVICE_KEY!,
      buckets: { uploads: config.STORAGE_UPLOADS_BUCKET, media: config.STORAGE_MEDIA_BUCKET },
    });
  }
  return localStorage({
    dir: config.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), '.data', 'storage'),
    appUrl: config.APP_URL,
    secret: config.AUTH_SECRET,
  });
}
