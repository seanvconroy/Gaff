import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { developmentCopy } from '@/copy/developments';
import { developmentPageHref, developmentStepHref } from '@/domain/developments/links';
import { developmentView } from '@/server/developments/developments';
import { addTypeAction } from '../../../_flow/actions';
import { devFrame, requireDevelopmentMember } from '../../../_flow/frame';
import { TypeStep } from '../../../_flow/Steps';

export const metadata: Metadata = { title: developmentCopy.flow };

/** M33: "What kind of home is this?": a new type of home in the development. */
export default async function NewTypePage({
  params,
}: {
  params: Promise<{ developmentId: string }>;
}) {
  const { developmentId: id } = await params;
  const member = await requireDevelopmentMember();
  const view = await developmentView(member, id);
  if (!view) notFound();
  return (
    <TypeStep
      frame={devFrame(
        id,
        'type',
        view.types.length > 0 ? developmentPageHref(id) : developmentStepHref(id, 'photos'),
      )}
      action={addTypeAction.bind(null, id)}
      values={{}}
    />
  );
}
