'use server';

import { cookies } from 'next/headers';
import { cookieOptions } from '@/server/auth/cookies';
import { bookViewing, cancelViewing, type BookResult } from '@/server/viewings/booking';
import { confirmBookingCode, resendBookingCode, sendBookingCode } from '@/server/viewings/mobile';
import { toRenterPage } from './back';
import { keepFromPage } from './keep';
import { mobileCodeCookie } from './mobile-code';

/** After a booking was tried: their page, or the step that says what's wrong. */
async function afterBooking(token: string, slotId: string, result: BookResult): Promise<never> {
  if (result.ok) {
    // UX-PF-2: the mobile they confirmed for text reminders is kept, for a renter whose
    // profile keeps what they enter. One that came with an enquiry never is (Q12).
    await keepFromPage(token, 'booking', (entered) => ({ mobile: entered.mobile }));
    toRenterPage(token);
  }
  if (result.reason === 'invalid_link') toRenterPage(token);
  if (result.reason === 'full') toRenterPage(token, `/book?gone=1`);
  if (result.reason === 'mobile_needed') toRenterPage(token, `/book?slot=${slotId}`);
  toRenterPage(token, `/book?slot=${slotId}&problem=${result.reason}`);
}

/**
 * R12, UX-RN-5 to UX-RN-7: the confirm step books (or moves) the viewing, for someone whose
 * mobile is confirmed or who is moving a booking. A time that has just gone sends the renter
 * back to the list of the others; anything else is said at the confirm step. Nothing personal
 * goes in the address: a time's ID and a code for the problem.
 */
export async function bookAction(token: string, slotId: string): Promise<void> {
  await afterBooking(token, slotId, await bookViewing(token, slotId));
}

/**
 * P16 (Q51): "Text me a code". The renter's mobile, for a new booking: a 6-digit code goes to it
 * by text, and the next screen asks for it. Where texts aren't sent (the test copy), the code is
 * kept for ten minutes in this browser alone, to be shown on that screen.
 */
export async function sendCodeAction(
  token: string,
  slotId: string,
  formData: FormData,
): Promise<void> {
  const sent = await sendBookingCode(token, String(formData.get('mobile') ?? ''));
  await codeSent(token, slotId, sent);
}

/** P16: "Text me a new code", to the same number. */
export async function resendCodeAction(token: string, slotId: string): Promise<void> {
  const sent = await resendBookingCode(token);
  await codeSent(token, slotId, sent, true);
}

async function codeSent(
  token: string,
  slotId: string,
  sent: Awaited<ReturnType<typeof sendBookingCode>>,
  again = false,
): Promise<never> {
  if (!sent.ok) {
    if (sent.problem === 'link') toRenterPage(token);
    const problem = sent.problem === 'invalid' ? 'phone' : sent.problem;
    toRenterPage(
      token,
      again
        ? `/book?slot=${slotId}&step=code&problem=${problem}`
        : `/book?slot=${slotId}&problem=${problem}`,
    );
  }
  const jar = await cookies();
  if (sent.codeOnScreen) {
    jar.set(mobileCodeCookie(token), sent.codeOnScreen, cookieOptions(10 * 60));
  }
  toRenterPage(token, `/book?slot=${slotId}&step=code${again ? '&sent=again' : ''}`);
}

/** P16: the code from the text. When it's right, the viewing is booked straight away. */
export async function confirmCodeAction(
  token: string,
  slotId: string,
  formData: FormData,
): Promise<void> {
  const confirmed = await confirmBookingCode(token, String(formData.get('code') ?? ''));
  if (!confirmed.ok) {
    if (confirmed.problem === 'link') toRenterPage(token);
    toRenterPage(token, `/book?slot=${slotId}&step=code&problem=${confirmed.problem}`);
  }
  (await cookies()).delete(mobileCodeCookie(token));
  await afterBooking(token, slotId, await bookViewing(token, slotId));
}

/**
 * UX-RN-6: a place from the waiting list has no picker: the page's button takes it. Someone
 * without a confirmed mobile gives one first (P16).
 */
export async function takePlaceAction(token: string, slotId: string): Promise<void> {
  const result = await bookViewing(token, slotId);
  if (!result.ok && result.reason === 'mobile_needed') {
    toRenterPage(token, `/book?slot=${slotId}`);
  }
  // Taken or gone, the page says where they stand now.
  toRenterPage(token);
}

export async function cancelAction(token: string): Promise<void> {
  await cancelViewing(token);
  toRenterPage(token);
}
