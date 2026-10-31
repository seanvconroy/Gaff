'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { answerQuestion } from '@/server/answers/review';
import { UserFacingError } from '@/server/errors';

export async function answerAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await answerQuestion(
      member,
      String(formData.get('questionId')),
      String(formData.get('answer') ?? ''),
      formData.get('remember') === 'yes',
    );
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/questions?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/questions');
  redirect('/questions?done=sent');
}
