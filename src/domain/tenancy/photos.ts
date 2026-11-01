/**
 * R25: the largest inventory photo, under Vercel's 4.5 MB limit for a whole request (ADR-0014).
 * Phones shrink photos before upload, so this is rarely reached. Kept in its own file so the
 * browser can check it without loading the rest of the move-in rules.
 */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
