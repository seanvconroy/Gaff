import { filterKeys, type SearchFilters } from '@/domain/search/filters';
import type { AccountEmail } from './account-emails';
import { chipLabel } from './search';

/**
 * The words of saved homes, saved searches and their alerts (UX-SR-9, UX-SR-10, UX-RH "Saved",
 * Profile's "What you're looking for"). Plain, warm Irish English. Nothing here hurries anyone,
 * recommends a home or describes who a home would suit (rule 3, Q36): an alert says a home fits
 * what the renter asked, and nothing more.
 */

/**
 * A saved search in words: its chips, as search shows them. "Greystones, Co. Wicklow · 2
 * bedrooms". `placeName` is its place as the index names it (src/server/places).
 */
export function searchWords(filters: SearchFilters, now = new Date(), placeName = ''): string {
  return filterKeys
    .filter((key) => filters[key] !== undefined)
    .map((key) => chipLabel(key, filters, now, placeName))
    .filter(Boolean)
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
    sheetLead: 'We’ll email you as soon as a new home fits. You can choose once a day instead.',
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
    text: 'We’ll email you as soon as a new home fits, and tell you about each home once.',
    stop: 'Every email has “Once a day instead” and “Stop these”, each one tap.',
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
    alertsOn: 'We’ll email you when a new home fits one of your searches, each home once.',
    alertsOff: 'Emails about new homes are off. You can switch them on in Profile.',
    removedSearch: 'Search removed',
    savedOn: (date: string) => `Saved ${date}`,
    /** M85: what changed on a saved home since it was saved. */
    rentDown: (to: string, from: string) => `Rent down to ${to}, from ${from}`,
    newViewings: 'New viewing times added',
    /** M86: how each search tells them, and the switch. */
    howOften: 'Emails',
    instant: 'As soon as one is listed',
    daily: 'Once a day, at 8am',
    toDaily: 'Once a day instead',
    toInstant: 'As soon as listed instead',
    changedTo: {
      instant: 'You’ll hear as soon as one is listed',
      daily: 'You’ll hear once a day, at 8am',
    },
  },
  /** M86: the switch at the foot of an alert, once pressed. */
  frequencyChanged: {
    instant: {
      title: 'You’ll hear as soon as one is listed',
      text: 'We’ll email you within minutes of a new home that fits, each home once. You can change this on Saved.',
    },
    daily: {
      title: 'You’ll hear once a day',
      text: 'We’ll email you at 8am on any day a new home fits, each home once. You can change this on Saved.',
    },
    action: 'Search homes',
  },
  profile: {
    title: 'What you’re looking for',
    lead: 'Your saved searches. Search opens on any of them.',
    none: 'Nothing yet. Search, then press “Tell me when one comes up”.',
    alertsLabel: 'Email me when a new home fits',
    alertsHint:
      'As soon as one is listed, or once a day: you choose for each search on Saved. Each home once.',
    alertsOn: 'Emails about new homes are on',
    alertsOff: 'Emails about new homes are off',
  },
} as const;

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
      'Once you confirm, we’ll email you as soon as a new home fits. If you didn’t ask for this, there’s nothing to do: the search is dropped tomorrow.',
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
 * UX-SR-10, M86: the alert. New homes that fit what the renter asked, each with its page; the
 * search itself; the switch between "as soon as one is listed" and "once a day"; and "Stop
 * these", which works in one tap with no sign-in. NEW WORDING for the solicitor (the timing
 * words changed with Q51).
 */
export function searchAlertEmail(input: {
  homes: readonly AlertHome[];
  /** Each search that found a home, in words. */
  searches: readonly string[];
  /** The first search's results on Gaff. */
  searchUrl: string;
  stopUrl: string;
  /** How these searches hear now. */
  frequency: 'instant' | 'daily';
  /** The other choice, in one tap. */
  switchUrl: string;
}): AccountEmail {
  const one = input.homes.length === 1;
  const what =
    input.searches.length === 1
      ? `what you asked for: ${input.searches[0]}`
      : 'what you asked for in your searches';
  const again =
    input.frequency === 'instant'
      ? 'We’ll email you again as soon as another home fits.'
      : 'We’ll email you again at 8am on a day another home fits.';
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
        ? `You can ask to view it on its page, and you’ll hear back either way. ${again}`
        : `You can ask to view any of them on its page, and you’ll hear back either way. ${again}`,
      '',
      input.frequency === 'instant'
        ? `Once a day instead: ${input.switchUrl}`
        : `As soon as one is listed instead: ${input.switchUrl}`,
      '',
      `Stop these: ${input.stopUrl}`,
      '',
      'Gaff',
    ].join('\n'),
  };
}
