import { filterKeys, type SearchFilters } from '@/domain/search/filters';
import type { AccountEmail } from './account-emails';
import { chipLabel } from './search';

/**
 * The words of saved homes, saved searches and their alerts (UX-SR-9, UX-SR-10, UX-RH "Saved",
 * Profile's "What you're looking for"). Plain, warm Irish English. Nothing here hurries anyone,
 * recommends a home or describes who a home would suit (rule 3, Q36): an alert says a home fits
 * what the renter asked, and nothing more.
 */

/** A saved search in words: its chips, as search shows them. "Greystones · 2 bedrooms". */
export function searchWords(filters: SearchFilters, now = new Date()): string {
  return filterKeys
    .filter((key) => filters[key] !== undefined)
    .map((key) => chipLabel(key, filters, now))
    .join(' · ');
}

export const savedCopy = {
  heart: {
    /** On a home's own page, where the address is the heading beside it. */
    page: 'Save this home',
    saved: 'Saved',
    removed: 'Removed from Saved',
    failed: 'That didn’t save. Try again in a moment.',
  },
  /** UX-SR-9, UX-SR-10: "Tell me when one comes up". */
  alert: {
    action: 'Tell me when one comes up',
    /** Under the results, when homes do fit: the same, for the homes still to come. */
    fromResults: 'Tell me about new ones',
    sheetTitle: 'Tell me when one comes up',
    emailLabel: 'Your email',
    save: 'Save this search',
    saving: 'Saving',
    cancel: 'Cancel',
    emailProblem: 'Enter your email address, like name@example.ie.',
    tooMany: 'This address has too many searches waiting. Confirm one from your email first.',
    tooManySaved: 'You have 20 searches saved. Remove one on Profile to save this one.',
    failed: 'That didn’t save. Try again in a moment.',
    sheetLead: 'We’ll email you when a new home fits, once a day at most.',
    checkTitle: 'Check your email',
    check: (email: string) =>
      `We’ve sent a link to ${email}. Open it to confirm, and we’ll email you when a new home fits.`,
    done: 'Done',
    saved: 'Saved. We’ll email you when a new home fits.',
    already: 'You’re already told about this search.',
    kept: 'You’ll hear when one comes up',
  },
  confirmed: {
    title: 'You’ll hear when one comes up',
    text: 'We’ll email you when a new home fits, once a day at most, and tell you about each home once.',
    stop: 'Every email has “Stop these”, to stop them in one tap.',
    action: 'See homes now',
  },
  expired: {
    title: 'This link has expired',
    text: 'A search that isn’t confirmed within a day is dropped. Search again, and press “Tell me when one comes up”.',
    action: 'Search homes',
  },
  stopped: {
    title: 'These emails have stopped',
    email:
      'We’ve deleted your saved searches, so we won’t email you about new homes again. You can save a search again at any time.',
    profile:
      'We won’t email you about new homes. Your searches stay on your profile, where you can switch these emails back on.',
    action: 'Search homes',
  },
  page: {
    title: 'Saved',
    homes: 'Homes',
    noHomes: 'Homes you save appear here. Tap the heart on any home.',
    searches: 'Searches',
    noSearches: 'Searches you save appear here. Search, then press “Tell me when one comes up”.',
    seeHomes: 'See homes',
    remove: 'Remove',
    let: 'This home has been let',
    gone: 'No longer on Gaff',
    search: 'Search homes',
    alertsOn: 'We’ll email you when a new home fits one of your searches, once a day at most.',
    alertsOff: 'Emails about new homes are off. You can switch them on in Profile.',
    removedSearch: 'Search removed',
  },
  profile: {
    title: 'What you’re looking for',
    lead: 'Your saved searches. Search opens on any of them.',
    none: 'Nothing yet. Search, then press “Tell me when one comes up”.',
    alertsLabel: 'Email me when a new home fits',
    alertsHint: 'Once a day at most, each home once.',
    alertsOn: 'Emails about new homes are on',
    alertsOff: 'Emails about new homes are off',
  },
} as const;

/** The heart's label on Saved, where it takes a home off the list. */
export const removeSavedLabel = (what: string) => `Remove ${what} from Saved`;

/**
 * UX-SR-10: the one email a signed-out person gets before anything else: confirm the address is
 * theirs. Until they do, the search sends nothing. NEW WORDING for the solicitor.
 */
export function confirmSearchEmail(input: { search: string; confirmUrl: string }): AccountEmail {
  return {
    subject: 'Confirm your search on Gaff',
    button: 'Confirm my search',
    text: [
      'Hello,',
      '',
      `You asked Gaff to tell you when a home comes up: ${input.search}.`,
      '',
      input.confirmUrl,
      '',
      'Once you confirm, we’ll email you when a new home fits, once a day at most. If you didn’t ask for this, there’s nothing to do: the search is dropped tomorrow.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** One home in an alert: public facts only, as its card says them. */
export interface AlertHome {
  /** "4 Harbour Road, Greystones" */
  address: string;
  /** "€1,900 a month" */
  rent: string;
  url: string;
}

/**
 * UX-SR-10: the alert. New homes that fit what the renter asked, each with its page; the search
 * itself; and "Stop these", which works in one tap with no sign-in. At most one a day. NEW
 * WORDING for the solicitor.
 */
export function searchAlertEmail(input: {
  homes: readonly AlertHome[];
  /** Each search that found a home, in words. */
  searches: readonly string[];
  /** The first search's results on Gaff. */
  searchUrl: string;
  stopUrl: string;
}): AccountEmail {
  const one = input.homes.length === 1;
  const what =
    input.searches.length === 1
      ? `what you asked for: ${input.searches[0]}`
      : 'what you asked for in your searches';
  return {
    subject: one
      ? `A new home fits your search: ${input.homes[0]!.address}`
      : `${input.homes.length} new homes fit your search`,
    button: 'See homes that fit',
    text: [
      'Hello,',
      '',
      one
        ? `A new home on Gaff fits ${what}.`
        : `${input.homes.length} new homes on Gaff fit ${what}.`,
      '',
      ...input.homes.map((home) => `${home.address}, ${home.rent}: ${home.url}`),
      '',
      input.searchUrl,
      '',
      one
        ? 'You can ask to view it on its page, and you’ll hear back either way. We’ll email you again when another home fits, once a day at most.'
        : 'You can ask to view any of them on its page, and you’ll hear back either way. We’ll email you again when another home fits, once a day at most.',
      '',
      `Stop these: ${input.stopUrl}`,
      '',
      'Gaff',
    ].join('\n'),
  };
}
