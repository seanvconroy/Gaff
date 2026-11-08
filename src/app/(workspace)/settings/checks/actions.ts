'use server';

import { redirect } from 'next/navigation';
import { mobileProblems } from '@/copy/verification';
import { invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { identityOffline, startIdentityCheck } from '@/server/verification/identity';
import { confirmMobileCode, sendMobileCode } from '@/server/verification/mobile';

/** M3: texts a code to the mobile number. */
export async function sendCodeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const phone = String(formData.get('phone') ?? '');
  const sent = await sendMobileCode(member.userId, phone);
  if (!sent.ok) return invalid({ phone: mobileProblems[sent.problem] }, { phone });
  return {
    values: {
      phone,
      masked: sent.masked,
      ...(sent.testCopyCode ? { testCode: sent.testCopyCode } : {}),
    },
    message: 'sent',
  };
}

/** M3: confirms the number with the code from the text. */
export async function confirmCodeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const code = String(formData.get('code') ?? '');
  const values = {
    phone: String(formData.get('phone') ?? ''),
    masked: String(formData.get('masked') ?? ''),
  };
  const confirmed = await confirmMobileCode(member.userId, code);
  if (!confirmed.ok) {
    return { ...invalid({ code: mobileProblems[confirmed.problem] }, values), message: 'sent' };
  }
  redirect('/settings/checks?saved=mobile');
}

/**
 * M24, P15, P18: sends the letter to the ID check: with a selfie, once they've agreed to it, or
 * the document alone. Agents and landlords alike.
 */
export async function startIdentityAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  const selfie = formData.get('selfie') !== 'no';
  let url: string;
  try {
    url = (
      await startIdentityCheck(member, { selfie, consented: formData.get('consent') === 'yes' })
    ).redirectUrl;
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/settings/checks?problem=${encodeURIComponent(error.message)}`);
  }
  redirect(url);
}

/** P20, Q55: the letter's ID can't be checked online; a person at Gaff checks it with them. */
export async function identityOfflineAction(): Promise<void> {
  const member = await requireMember();
  await identityOffline(member);
  redirect('/settings/checks?identity=offline');
}
