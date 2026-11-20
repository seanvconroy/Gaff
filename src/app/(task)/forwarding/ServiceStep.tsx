'use client';

import { Mail, MailQuestionMark, Inbox } from 'lucide-react';
import { forwardingCopy } from '@/copy/forwarding';
import { forwardingServices } from '@/domain/enquiries/forwarding';
import type { FormState } from '@/lib/forms';
import { ChoiceCards } from '@/ui/ChoiceCards';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';
import { progress } from './progress';

const copy = forwardingCopy;
const icons = { gmail: Mail, outlook: Inbox, other: MailQuestionMark } as const;

function check(values: Record<string, string>): Record<string, string> {
  return values.service ? {} : { service: copy.service.choose };
}

/** Screen 1 (UX-LT-17): "Where do your Daft enquiries arrive?", as three cards. */
export function ServiceStep({
  action,
  leaveHref,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  leaveHref: string;
}) {
  const { form, errors, count, attempt } = useFlowForm(action, check);
  return (
    <FlowShell
      leave={{ kind: 'close', href: leaveHref }}
      progress={progress(0)}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.next}>
          {copy.next}
        </SubmitButton>
      }
      form={form}
    >
      <FlowTitle title={copy.service.title} lead={copy.service.lead} />
      <FlowProblems count={count} />
      <div key={attempt}>
        <ChoiceCards
          name="service"
          legend={copy.service.title}
          hideLegend
          error={errors.service}
          options={forwardingServices.map((service) => ({
            value: service,
            label: copy.service.options[service].label,
            help: copy.service.options[service].help,
            icon: icons[service],
          }))}
        />
      </div>
    </FlowShell>
  );
}
