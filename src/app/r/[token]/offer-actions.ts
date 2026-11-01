'use server';

import { redirect } from 'next/navigation';
import { respondToOffer } from '@/server/offers/offer';

/** R20: the renter accepts or declines the offer. */
export async function respondAction(token: string, answer: 'accept' | 'decline'): Promise<void> {
  const result = await respondToOffer(token, answer);
  if (!result.ok) redirect(`/r/${token}?offer_problem=${result.reason}`);
  redirect(`/r/${token}?${result.accepted ? 'accepted' : 'declined'}=1`);
}
