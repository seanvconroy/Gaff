import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { advertReaderIsOn } from './advert-reader';

/**
 * Testing only (DEV_TOOLS=1, never in production): this cookie switches the advert reader off
 * for one browser, so a journey can show the manual route with the reader off (UX-AI-12) while
 * the rest of the run reads adverts as usual.
 */
export const READER_OFF_COOKIE = 'gaff-dev-advert-reader';

/**
 * UX-LT-1, UX-AI-12: whether the first screen of adding a letting offers reading at all. Off
 * (`ADVERT_READER=off`), it offers only "Fill it in myself", which never needs the reader.
 */
export async function readingIsOffered(): Promise<boolean> {
  if (!advertReaderIsOn()) return false;
  if (!env().DEV_TOOLS) return true;
  return (await cookies()).get(READER_OFF_COOKIE)?.value !== 'off';
}
