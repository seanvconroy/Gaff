import { env } from '@/lib/env';
import type { DocumentStore } from '@/ports/document-store';
import { localDocumentStore } from './local';
import { supabaseDocumentStore } from './supabase';

/** BA-16 (P53): the document store in use (DOCUMENT_STORE). */
export function documentStore(): DocumentStore {
  const config = env();
  if (config.DOCUMENT_STORE === 'supabase') {
    return supabaseDocumentStore({
      url: config.SUPABASE_URL!,
      serviceKey: config.SUPABASE_SERVICE_ROLE_KEY!,
      bucket: config.DOCUMENT_BUCKET,
    });
  }
  return localDocumentStore;
}
