import { LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: 'Help' };

/**
 * Help, from the account menu (UX-NV-8). A stub until the founders choose how people reach
 * Gaff's team: it says what will be here, and invents no address to write to.
 */
export default function HelpPage() {
  return (
    <Stack gap={8}>
      <PageHeader title="Help" />
      <EmptyState icon={LifeBuoy} title="Help with using Gaff will appear here." />
    </Stack>
  );
}
