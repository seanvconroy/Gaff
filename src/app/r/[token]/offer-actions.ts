'use server';

import { respondToOffer } from '@/server/offers/offer';
import { toRenterPage } from './back';

/** R20, UX-RN-19, UX-RN-20: the renter accepts or declines. Declining asks for no reason. */
export async function respondAction(token: string, answer: 'accept' | 'decline'): Promise<void> {
  const result = await respondToOffer(token, answer);
  // Whatever happened, their page says where they stand now; a problem is said there once.
  toRenterPage(token, result.ok ? '' : `?offer_problem=${result.reason}`);
}
