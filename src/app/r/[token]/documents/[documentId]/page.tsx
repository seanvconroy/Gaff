import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { renterDocumentsCopy } from '@/copy/documents';
import { documentForRenter } from '@/server/documents/renter';
import { personOnRenterPage } from '@/server/renter/person';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { LinkEnded, loadRenter } from '../../load';
import { Task } from '../../Task';
import { CorrectionForm } from './CorrectionForm';

export const metadata: Metadata = { title: 'Check what was read' };
export const dynamic = 'force-dynamic';

const copy = renterDocumentsCopy.change;

/**
 * BA-16 (P39, P5): one document's reading, for the renter to check and correct, or to enter
 * where Gaff couldn't read it. Only on an open page of checks (UX-RN-14), and only before they
 * share. The address holds the document's ID alone, never anything it says.
 */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ token: string; documentId: string }>;
}) {
  const { token, documentId } = await params;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  const { model } = loaded;
  if (model.view !== 'checks' || !(await loaded.isOpen())) redirect(`/r/${token}`);
  const person = await personOnRenterPage(token, loaded.page);
  const found = await documentForRenter(token, person?.userId ?? null, documentId);
  if (!found) redirect(`/r/${token}`);
  const enter = found.readBy === 'nobody';
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{copy.after(model.operator)}</p>}
    >
      <Task title={enter ? copy.titleEnter : copy.title} lead={copy.lead}>
        <CorrectionForm
          token={token}
          documentId={documentId}
          kind={found.kind}
          reading={found.reading}
        />
      </Task>
    </PrivateFrame>
  );
}
