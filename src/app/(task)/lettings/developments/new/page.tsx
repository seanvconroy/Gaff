import type { Metadata } from 'next';
import { developmentCopy } from '@/copy/developments';
import { createDevelopmentAction } from '../_flow/actions';
import { devFrame, requireDevelopmentMember } from '../_flow/frame';
import { NameStep } from '../_flow/Steps';

export const metadata: Metadata = { title: developmentCopy.flow };

/**
 * BA-15 (M32): "Several alike in one development", from "Add a letting": the first question,
 * its name. A focused task: closing it goes back to Lettings.
 */
export default async function NewDevelopmentPage() {
  await requireDevelopmentMember();
  return (
    <NameStep
      frame={devFrame(null, 'name', '/lettings/new', false)}
      action={createDevelopmentAction}
      name=""
    />
  );
}
