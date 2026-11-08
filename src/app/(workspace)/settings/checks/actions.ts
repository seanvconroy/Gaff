'use server';

import { redirect } from 'next/navigation';
import { mobileProblems } from '@/copy/verification';
import { invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { startIdentityCheck } from '@/server/verification/identity';
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

/** M24: sends a private landlord to the ID check. */
export async function startIdentityAction(): Promise<void> {
  const member = await requireMember();
  let url: string;
  try {
    url = (await startIdentityCheck(member)).redirectUrl;
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/settings/checks');
  }
  redirect(url);
}
