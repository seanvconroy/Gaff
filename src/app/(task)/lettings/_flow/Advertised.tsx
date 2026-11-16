'use client';

import { addLettingCopy } from '@/copy/add-letting';
import type { FormState } from '@/lib/forms';
import { ChoiceGroup } from '@/ui/Field';
import { FlowProblems, FlowShell } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';
import type { StepFrame } from './StepForm';

const copy = addLettingCopy.advertised;

/** Daft, MyHome or both; or No on its own. The same rule the server applies. */
function check(values: Record<string, string>): Record<string, string> {
  const chosen = (values.where ?? '').split(',').filter(Boolean);
  if (chosen.length === 0) return { where: copy.choose };
  if (chosen.includes('no') && chosen.length > 1) return { where: copy.notBoth };
  return {};
}

/**
 * After go-live (UX-FL-4): what was done and what Gaff does next, and one question, "Is it
 * advertised anywhere else?" The answer is kept on the letting. A home on Daft or MyHome needs
 * its enquiries forwarded to Gaff: that set-up is its own flow (work package WP-11), and until
 * it exists the letting's page shows it as a task.
 */
export function AdvertisedStep({
  frame,
  action,
  address,
  chosen,
}: {
  frame: StepFrame;
  action: (state: FormState, data: FormData) => Promise<FormState>;
  address: string;
  /** The answer given before, if this is a second look. */
  chosen: readonly string[];
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action, check);
  return (
    <FlowShell
      leave={{ kind: 'close', href: frame.leaveHref }}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={addLettingCopy.saving}>
          {copy.done}
        </SubmitButton>
      }
      form={{ ...form, id: 'advertised' }}
    >
      <Outcome tone="success" title={copy.live(address)} headingLevel={1}>
        <p>{copy.lead}</p>
      </Outcome>
      <FlowProblems count={count} />
      <div key={attempt}>
        <ChoiceGroup
          name="where"
          type="checkbox"
          legend={copy.title}
          defaultValue={values?.where ?? chosen}
          error={errors.where}
          options={[
            { value: 'daft', label: copy.daft },
            { value: 'myhome', label: copy.myhome },
            { value: 'no', label: copy.no },
          ]}
        />
      </div>
    </FlowShell>
  );
}
