import { cookies } from 'next/headers';
import {
  detailsToKeep,
  type DetailsToKeep,
  type KeptDetails,
  NOTHING_KEPT,
} from '@/domain/profile/kept';
import { enquiryIsTheirs } from '@/domain/profile/ownership';
import { linkPassCookie, linkPassStands } from '@/server/access/link-codes';
import { attachEnquiry, ownEnquiry } from '@/server/accounts/enquiries';
import {
  keepEntered,
  noteConfirmed,
  noteProfileUse,
  readRenterProfile,
} from '@/server/accounts/renter-profile';
import { cookieOptions } from '@/server/auth/cookies';
import { currentUser } from '@/server/auth/member';
import { hashToken } from '@/server/access/links';
import type { loadRenterPage } from './answers';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadRenterPage>>>;

/**
 * UX-RH-4, UX-PF-2, UX-PF-3: the signed-in person on one of a renter's pages, where the enquiry
 * is their own. Their pages still need no account (UX-PP-8): with nobody signed in this is null,
 * and every page works as it always has.
 *
 * WHERE A PROFILE MEETS AN APPLICATION. An application is the operator's copy; a profile is the
 * renter's own, and no operator's path can read it. They meet only here, on the renter's own
 * page, in the renter's own request:
 * - the enquiry is added to their Enquiries (`attach`), once it's shown to be theirs;
 * - what they keep is read, to offer back at the stage that asks for it (rule 2);
 * - what they enter is kept, while keeping is on.
 * Nothing goes from the profile to the application except what the renter sends themselves.
 */
export interface PagePerson {
  userId: string;
  /** Whether keeping what they enter is on (UX-PF-2). */
  keepsDetails: boolean;
  /** What their profile holds. Offered back only by the rules in src/domain/profile/offer-back. */
  kept: KeptDetails;
}

async function hasPass(token: string): Promise<boolean> {
  const jar = await cookies();
  return linkPassStands(token, jar.get(linkPassCookie(token))?.value);
}

/**
 * The signed-in person, if this enquiry is theirs: already in their Enquiries, made from the
 * address they sign in with, or opened with the one-time code in this browser. With `attach`, it
 * is added to their Enquiries now (UX-RH-4). Anyone else gets null: a forwarded link never makes
 * someone else's enquiry part of a person's profile.
 */
export async function personOnRenterPage(
  token: string,
  page: Loaded,
  options: { attach?: boolean } = {},
): Promise<PagePerson | null> {
  const user = await currentUser();
  if (!user) return null;
  const attached = (await ownEnquiry(user.id, page.application.id)) !== null;
  const theirs = enquiryIsTheirs({
    person: { email: user.email, emailVerified: user.emailVerified },
    applicationEmail: page.application.email,
    hasPass: attached ? false : await hasPass(token),
    attached,
  });
  if (!theirs) return null;
  if (!attached) {
    if (!options.attach) return null;
    const added = await attachEnquiry(user.id, {
      applicationId: page.application.id,
      organisationId: page.organisation.id,
      lettingId: page.letting.id,
    });
    // Already in someone else's Enquiries: it stays theirs.
    if (!added) return null;
  }
  await noteProfileUse(user.id);
  const profile = await readRenterProfile(user.id);
  return { userId: user.id, keepsDetails: profile.keepsDetails, kept: profile ?? NOTHING_KEPT };
}

/** What may be kept from this application as it stands now (src/domain/profile/kept.ts). */
export function enteredOn(page: Loaded): DetailsToKeep {
  return detailsToKeep(page.application);
}

/**
 * UX-PF-2: after a renter with a profile sends something on their own page, keeps the part they
 * just entered, if keeping is on. `confirmed` notes that kept details were offered back and sent
 * on unchanged or changed, by their own press of the button (UX-PF-3).
 */
export async function keepAfter(
  person: PagePerson,
  applicationId: string,
  from: 'application' | 'answers' | 'booking',
  entered: DetailsToKeep,
  confirmed?: 'answers' | 'income',
): Promise<void> {
  if (confirmed) await noteConfirmed(person.userId, applicationId, confirmed);
  await keepEntered(person.userId, entered, { from, applicationId });
}

/**
 * UX-RN-13: "Keep my details for next time" was ticked by someone who isn't signed in. Their
 * choice is remembered in this browser, for this link, while they enter the code that sets up
 * their profile: a yes, and nothing about them.
 */
export function keepIntentCookie(token: string): string {
  return `gaff_keep_${hashToken(token).slice(0, 16)}`;
}

const KEEP_INTENT_MINUTES = 30;

export async function rememberKeepIntent(token: string): Promise<void> {
  (await cookies()).set(keepIntentCookie(token), '1', cookieOptions(KEEP_INTENT_MINUTES * 60));
}

/** Whether this browser ticked the box for this link a short while ago. Forgotten once read. */
export async function takeKeepIntent(token: string): Promise<boolean> {
  const jar = await cookies();
  const name = keepIntentCookie(token);
  const ticked = jar.get(name)?.value === '1';
  if (ticked) jar.delete(name);
  return ticked;
}
