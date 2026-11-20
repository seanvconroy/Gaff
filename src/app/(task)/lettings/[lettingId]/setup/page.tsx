import { redirect } from 'next/navigation';
import { resumeStep } from '@/domain/lettings/add-letting';
import { fromOf, screenHref } from '@/domain/lettings/links';
import { flowHome } from '../../_flow/home';

/**
 * UX-FL-2: "Continue". Wherever the person left off adding this home, that is where they land:
 * the step they had reached, or an earlier one that still lacks an answer.
 */
export default async function ResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { lettingId } = await params;
  const { home } = await flowHome(lettingId);
  const from = fromOf((await searchParams).from);
  if (home.kind === 'letting' && home.detail.letting.stage !== 'setup') {
    redirect(`/lettings/${lettingId}`);
  }
  const step = resumeStep(
    // A letting made all at once (an import, or a test) starts at the first step after its core.
    home.kind === 'letting' ? (home.reached ?? 'photos') : home.reached,
    { answers: home.answers, rentCheckDone: home.detail?.setup.rentCheckDone ?? false },
  );
  redirect(screenHref(lettingId, step, from));
}
