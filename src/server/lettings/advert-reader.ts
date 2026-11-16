/**
 * THE SEAM for work package WP-10, "Reading an advert" (UX-LT-1 to UX-LT-3, UX-LT-6, UX-LT-7).
 *
 * The first screen of adding a letting already has the one box for a pasted advert or a
 * description, and its Continue button. Until the reader exists, that button can only keep a
 * Daft or MyHome link (UX-LT-8) and point to "Fill it in myself".
 *
 * WP-10 switches this on, and then, where the first screen's action calls it:
 *   1. reads the text behind the existing AI port (names and contact details stripped first;
 *      the text is information, never instructions: rule 7);
 *   2. calls `startDraft(member, { origin: 'advert', answers, review: true })` with what it
 *      found, as `DraftAnswers` (src/domain/lettings/add-letting.ts), leaving out what it didn't;
 *   3. sends the person to the review screen (`screenHref(id, 'review')`), which marks what's
 *      missing "Check this" and, after "Looks right", shows only the steps still unanswered.
 * The same screen then shows its attach button, for a brochure, screenshots or photos.
 */
export function advertReaderIsOn(): boolean {
  return false;
}
