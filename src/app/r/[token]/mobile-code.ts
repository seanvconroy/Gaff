import { hashToken } from '@/server/access/links';

/**
 * P16: where texts aren't sent (the fake sender on the test copy), the code that would have gone
 * by text is kept in this browser alone, for ten minutes, to be shown on the code screen. The
 * cookie is named for the link, never holding it; Gaff's own record of the code is a hash.
 */
export function mobileCodeCookie(token: string): string {
  return `gaff_mobile_code_${hashToken(token).slice(0, 16)}`;
}
