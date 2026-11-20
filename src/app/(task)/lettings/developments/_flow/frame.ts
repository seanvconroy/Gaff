import { redirect } from 'next/navigation';
import { developmentCopy } from '@/copy/developments';
import { mayHaveDevelopments } from '@/domain/developments/development';
import {
  type DevelopmentStep,
  type TypeStep,
  developmentPageHref,
  progressAt,
  progressSegments,
} from '@/domain/developments/links';
import { requireMember } from '@/server/auth/member';
import type { StepFrame } from '../../_flow/StepForm';

/** Every screen of adding a development: its progress, and the way out to its page. */
export function devFrame(
  developmentId: string | null,
  step: DevelopmentStep | 'name' | 'type' | TypeStep,
  backHref?: string,
  exit = true,
): StepFrame {
  return {
    leaveHref: developmentId ? developmentPageHref(developmentId) : '/lettings',
    backHref,
    exit,
    progress: {
      label: developmentCopy.flow,
      segments: [...progressSegments],
      current: progressAt(step),
    },
  };
}

/** A development is for an agency or a landlord's team: anyone else adds homes one at a time. */
export async function requireDevelopmentMember() {
  const member = await requireMember();
  if (!mayHaveDevelopments(member.organisationKind)) redirect('/lettings/new');
  return member;
}
