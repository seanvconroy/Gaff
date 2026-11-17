'use client';

import { useRef, useState } from 'react';
import { keepCopy } from '@/copy/profile';
import { applyCopy, codeGateCopy, common } from '@/copy/renter';
import { applicationProblems, earningLabels, type Earning } from '@/domain/applications/apply';
import type { Keeping } from '@/domain/profile/offer-back';
import { Button } from '@/ui/Button';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { OptionRow } from '@/ui/OptionRow';
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
 * THE PROFILE (UX-RN-13, UX-PF-2, UX-PF-3, UX-PF-5, Q25). `keeping` says what the check screen
 * says about keeping (`keepingFor`): one tick, off by default, "Keep my details for next time",
 * for someone with no profile here; one line for someone whose profile keeps what they enter;
 * nothing if they switched keeping off. `offered` is a kept income, already filled in: the page
 * opens on the check screen, which says it is from their profile and when they said so, for
 * them to confirm or change. Nothing reaches the operator until they press the button.
 */
export function ApplyFlow({
  token,
  operator,
  rule,
  sentTo,
  current,
  startAt,
  keeping = 'tick',
  offered = null,
}: {
  token: string;
  operator: string;
  /** The operator's income rule, as "2.5". */
  rule: string;
  /** Where a code would go, with most of the address hidden. */
  sentTo: string;
  current: Record<string, string>;
  startAt?: string | null;
  keeping?: Keeping;
  /** A kept income, offered back: when they said it, in words. */
  offered?: { saidOn: string } | null;
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
      lead: offered ? `${keepCopy.stillRight} ${keepCopy.fromProfile}` : undefined,
      fields: [],
      content: ({ values, goTo }) => (
        <>
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
                value:
                  offered && values.monthlyIncome === current.monthlyIncome ? (
                    <>
                      {applyCopy.check.aMonth((values.monthlyIncome ?? '').replace(/^€\s*/, ''))}
                      <br />
                      <span>{keepCopy.saidOn(offered.saidOn)}</span>
                    </>
                  ) : (
                    applyCopy.check.aMonth((values.monthlyIncome ?? '').replace(/^€\s*/, ''))
                  ),
                action: change('income', () => goTo('income')),
              },
            ]}
          />
          {offered ? <input type="hidden" name="offered" value="income" /> : null}
          {keeping === 'tick' ? (
            <OptionRow
              name="keepDetails"
              label={keepCopy.tick}
              hint={keepCopy.tickHint}
              defaultOn={defaults.keepDetails === 'on'}
            />
          ) : keeping === 'on' ? (
            <p>{keepCopy.kept}</p>
          ) : null}
        </>
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
