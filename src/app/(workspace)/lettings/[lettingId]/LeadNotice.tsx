import { teamCopy } from '@/copy/team';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { helpAction } from './team-actions';

const copy = teamCopy.help;

/**
 * UX-AG-8 (the permissions table): on a letting someone else leads, an agent sees who leads it
 * and "Help with this letting", which lets them act on it. An admin, the lead, and anyone
 * already helping see nothing here.
 */
export function LeadNotice({
  lettingId,
  leadName,
  offersHelp,
}: {
  lettingId: string;
  leadName: string | null;
  offersHelp: boolean;
}) {
  if (!offersHelp || !leadName) return null;
  return (
    <Notice tone="info" title={copy.leads(leadName)}>
      <p>{copy.why}</p>
      <form action={helpAction.bind(null, lettingId)}>
        <SubmitButton variant="secondary" pendingLabel={copy.helping}>
          {copy.button}
        </SubmitButton>
      </form>
    </Notice>
  );
}
