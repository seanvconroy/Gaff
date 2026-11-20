'use server';

import { notFound, redirect } from 'next/navigation';
import { filterFromParams, isEmptyFilter, peopleHref } from '@/domain/fit/ask';
import { requireMember } from '@/server/auth/member';
import { askAboutPeople } from '@/server/lettings/ask';

const SHOW = /^[a-z_]{1,12}$/;

/**
 * UX-LP-15: "Ask about who's enquired". The question goes no further than this request: it
 * comes back as chips in People's address, or as the fixed decline, and nothing of it is kept.
 * A question that is declined leaves the list as it was before the question.
 */
export async function askAboutPeopleAction(lettingId: string, formData: FormData): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const member = await requireMember();
  const show = String(formData.get('show') ?? '');
  const before = filterFromParams(
    Object.fromEntries(
      [...formData.entries()]
        .filter(([key]) => key.startsWith('f_'))
        .map(([key, value]) => [key.slice(2), String(value)]),
    ),
  );
  const filter = await askAboutPeople(member, lettingId, formData.get('question'));
  redirect(
    peopleHref(lettingId, {
      show: SHOW.test(show) ? show : null,
      filter: filter && !isEmptyFilter(filter) ? filter : before,
      declined: !filter,
    }),
  );
}
