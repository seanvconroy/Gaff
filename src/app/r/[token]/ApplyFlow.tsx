'use client';

import { useRef, useState } from 'react';
import { applyCopy, codeGateCopy, common } from '@/copy/renter';
import { applicationProblems, earningLabels, type Earning } from '@/domain/applications/apply';
import { Button } from '@/ui/Button';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { QuestionSteps, type QuestionStep } from '@/ui/QuestionSteps';
import { Sheet } from '@/ui/Sheet';
import { SummaryList } from '@/ui/SummaryList';
import { useSend } from '@/ui/useSend';
import { applyAction } from './apply-actions';
import { CodeGate } from './CodeGate';

/**
 * R16, UX-RN-11 to UX-RN-13: applying is two questions, one per screen, then a check screen that
 * shows their name and email, each with "Change". No documents, and nothing asks whether they
 * receive housing support: it counts as income, and the help says to include it (rule 3).
 *
 * A changed email asks for the one-time code first (UX-SI-12), in a sheet over the check screen.
 *
 * THE PROFILE'S SEAM (UX-RN-13, Q25): "Keep my details for next time" belongs on the check
 * screen, as one tick, off by default, under the summary. It creates a renter's profile, which
 * work package WP-14 builds. Pass it to `QuestionSteps` as the check step's last control, and
 * read `keepDetails` in `applyAction`. Nothing is offered until then, rather than a tick that
 * does nothing.
 */
export function ApplyFlow({
  token,
  operator,
  rule,
  sentTo,
  current,
  startAt,
}: {
  token: string;
  operator: string;
  /** The operator's income rule, as "2.5". */
  rule: string;
  /** Where a code would go, with most of the address hidden. */
  sentTo: string;
  current: Record<string, string>;
  startAt?: string | null;
}) {
  const [state, action] = useSend(applyAction.bind(null, token), common.sendFailed);
  const form = useRef<HTMLFormElement>(null);
  const [closed, setClosed] = useState<number | undefined>();
  const defaults = state.values ?? current;
  const needsCode = state.confirm === 'link_code' && closed !== state.attempt;
  const change = (what: string, goTo: () => void) => (
    <Button variant="quiet" onClick={goTo}>
      {common.change}
      <span className="visually-hidden"> {what}</span>
    </Button>
  );
  const steps: QuestionStep[] = [
    {
      id: 'earning',
      name: applyCopy.names.earning,
      title: applyCopy.earning.title,
      fields: ['earning'],
      check: (values) => applicationProblems(values, ['earning']),
      content: ({ errors }) => (
        <ChoiceGroup
          name="earning"
          legend={applyCopy.earning.title}
          hideLegend
          defaultValue={defaults.earning}
          error={errors.earning}
          options={Object.entries(earningLabels).map(([value, label]) => ({ value, label }))}
        />
      ),
    },
    {
      id: 'income',
      name: applyCopy.names.income,
      title: applyCopy.income.title,
      fields: ['monthlyIncome'],
      check: (values) => applicationProblems(values, ['monthlyIncome']),
      content: ({ errors }) => (
        <TextField
          name="monthlyIncome"
          label={applyCopy.income.label}
          hint={
            <>
              {applyCopy.income.help}
              <br />
              {applyCopy.income.rule(operator, rule)}
            </>
          }
          prefix="€"
          width="medium"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={defaults.monthlyIncome}
          error={errors.monthlyIncome}
        />
      ),
    },
    {
      id: 'check',
      name: applyCopy.names.check,
      title: applyCopy.check.title,
      fields: [],
      content: ({ values, goTo }) => (
        <SummaryList
          rows={[
            {
              label: applyCopy.check.name,
              value: values.fullName,
              action: change('name', () => goTo('name')),
            },
            {
              label: applyCopy.check.email,
              value: values.email,
              action: change('email', () => goTo('email')),
            },
            {
              label: applyCopy.check.earning,
              value: earningLabels[values.earning as Earning] ?? '',
              action: change('how you earn', () => goTo('earning')),
            },
            {
              label: applyCopy.check.income,
              value: applyCopy.check.aMonth((values.monthlyIncome ?? '').replace(/^€\s*/, '')),
              action: change('income', () => goTo('income')),
            },
          ]}
        />
      ),
    },
    {
      id: 'name',
      name: applyCopy.check.name,
      title: applyCopy.name.title,
      aside: true,
      fields: ['fullName'],
      check: (values) => applicationProblems(values, ['fullName']),
      content: ({ errors }) => (
        <TextField
          name="fullName"
          label={applyCopy.name.label}
          autoComplete="name"
          defaultValue={defaults.fullName}
          error={errors.fullName}
        />
      ),
    },
    {
      id: 'email',
      name: applyCopy.check.email,
      title: applyCopy.email.title,
      aside: true,
      fields: ['email'],
      check: (values) => applicationProblems(values, ['email']),
      content: ({ errors }) => (
        <TextField
          name="email"
          label={applyCopy.email.label}
          hint={applyCopy.email.hint}
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={defaults.email}
          error={errors.email}
        />
      ),
    },
  ];
  return (
    <>
      <QuestionSteps
        label={applyCopy.progress}
        steps={steps}
        action={action}
        defaults={defaults}
        serverErrors={state.errors}
        formKey={state.attempt}
        startAt={startAt}
        submit={applyCopy.send}
        pending={applyCopy.sending}
        done={applyCopy.name.done}
        formRef={form}
      />
      <Sheet open={needsCode} onClose={() => setClosed(state.attempt)} title={codeGateCopy.title}>
        <CodeGate
          token={token}
          sentTo={sentTo}
          onOpen={() => {
            setClosed(state.attempt);
            form.current?.requestSubmit();
          }}
        />
      </Sheet>
    </>
  );
}
