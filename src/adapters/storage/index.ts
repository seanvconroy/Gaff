import path from 'node:path';
import { env } from '@/lib/env';
import type { ObjectStorage } from '@/ports/storage';
import { databaseStorage } from './database';
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
  if (config.STORAGE_PROVIDER === 'database') {
    return databaseStorage({ appUrl: config.APP_URL, secret: config.AUTH_SECRET });
  }
  return localStorage({
    dir: config.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), '.data', 'storage'),
    appUrl: config.APP_URL,
    secret: config.AUTH_SECRET,
  });
}

/** The stand-ins served by /api/dev/storage: files on disk, or the test copy's database. */
export function servesDevStorage(): boolean {
  const provider = env().STORAGE_PROVIDER;
  return provider === 'local' || provider === 'database';
}
