'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { forwardingCopy } from '@/copy/forwarding';
import {
  type ForwardingFrom,
  forwardingFromQuery,
  forwardingHref,
  type ForwardingService,
  isForwardingService,
} from '@/domain/enquiries/forwarding';
import { type FormState, invalid } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { sendForwardingTest } from '@/server/enquiries/forwarding';
import { UserFacingError } from '@/server/errors';

const copy = forwardingCopy;

/** Where the flow was opened from, as the page bound it: only a letting's ID is kept. */
function cleanFrom(from: ForwardingFrom): ForwardingFrom {
  return forwardingFromQuery({
    letting: from.lettingId ?? undefined,
    live: from.justLive ? '1' : undefined,
  });
}

/** Screen 1: where the person's Daft enquiries arrive. On to that service's steps. */
export async function chooseServiceAction(
  from: ForwardingFrom,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireMember();
  const service = formData.get('service');
  if (!isForwardingService(service)) return invalid({ service: copy.service.choose }, {});
  redirect(forwardingHref(cleanFrom(from), 'steps', service));
}

const testForm = z.object({ to: z.email(copy.confirm.toProblem).max(254) });

/** Screen 3: send the made-up enquiry to the person's mailbox, then wait for it on screen 4. */
export async function sendTestAction(
  from: ForwardingFrom,
  service: ForwardingService,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = { to: String(formData.get('to') ?? '').trim() };
  const parsed = testForm.safeParse(values);
  if (!parsed.success || !isForwardingService(service)) {
    return invalid({ to: copy.confirm.toProblem }, values);
  }
  try {
    await sendForwardingTest(member, { to: parsed.data.to, service });
  } catch (error) {
    const message = error instanceof UserFacingError ? error.message : copy.confirm.sendProblem;
    return invalid({ to: message }, values);
  }
  redirect(forwardingHref(cleanFrom(from), 'test', service));
}
