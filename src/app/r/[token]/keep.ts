import type { DetailsToKeep } from '@/domain/profile/kept';
import { loadRenterPage } from '@/server/renter/answers';
import { enteredOn, keepAfter, personOnRenterPage } from '@/server/renter/person';

/**
 * UX-PF-2: after a renter sends something on their own page, the part they just entered is kept
 * on their profile, if the enquiry is theirs and keeping is on. Someone with no profile, or
 * nobody signed in, keeps nothing, and the page works as it always has.
 */
export async function keepFromPage(
  token: string,
  from: 'answers' | 'booking',
  part: (entered: DetailsToKeep) => DetailsToKeep,
): Promise<void> {
  const page = await loadRenterPage(token);
  if (!page) return;
  const person = await personOnRenterPage(token, page);
  if (!person) return;
  await keepAfter(person, page.application.id, from, part(enteredOn(page)));
}
