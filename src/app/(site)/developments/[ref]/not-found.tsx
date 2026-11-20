import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import { developmentCopy } from '@/copy/developments';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

const copy = developmentCopy.public.notAvailable;

export const metadata: Metadata = { title: copy.title };

/**
 * M75: a development's address with no page behind it: none of its homes is on Gaff now, or no
 * such development. Both look the same, and neither is a broken page.
 */
export default function DevelopmentNotAvailable() {
  return (
    <EmptyState
      icon={Building2}
      title={copy.title}
      action={
        <ButtonLink href="/" variant="primary">
          {copy.action}
        </ButtonLink>
      }
    >
      <p>{copy.text}</p>
    </EmptyState>
  );
}
