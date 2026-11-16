/** What a first-run address can carry from one screen to the next. */
export interface WelcomeParams {
  /** The screen asked for. Without it, first run opens where the person left it (UX-AC-10). */
  step?: 'name' | 'purpose' | 'agency' | 'confirm';
  /** Where they were going when they signed in: a path on this site, checked before use. */
  next?: string | null;
  /** They were asked their name in this visit, so it stays in the progress and Back reaches it. */
  named?: boolean;
  /** Agency search: what they typed. */
  q?: string;
  /** UX-AG-2: another way to answer "Which agency?". */
  by?: 'licence' | 'applying';
  /** The register entry they picked. */
  entry?: string;
}

/** A first-run screen's address. No personal data goes in it: a search for an agency isn't. */
export function welcomeHref(params: WelcomeParams = {}): string {
  const query = new URLSearchParams();
  if (params.step) query.set('step', params.step);
  if (params.by) query.set('by', params.by);
  if (params.entry) query.set('entry', params.entry);
  if (params.q) query.set('q', params.q);
  if (params.named) query.set('n', '1');
  if (params.next) query.set('next', params.next);
  const search = query.toString();
  return search ? `/welcome?${search}` : '/welcome';
}
