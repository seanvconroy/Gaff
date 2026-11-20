'use client';

import {
  type ComponentProps,
  type FocusEvent,
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import { emptyFormState, formValues, type FormState } from '@/lib/forms';
import { focusFirstProblem, problemOnLeaving } from './flow';

type Problems = Record<string, string>;

/**
 * What every step of a flow does with its form (UX-FL-3), so each step only has to draw its
 * fields:
 *
 * - errors appear at the field, under it, when the person leaves a field they typed in, or
 *   presses the primary button. There is no error box at the top;
 * - on pressing the button with errors, focus moves to the first field that needs attention,
 *   and `count` is what a screen reader hears (give it to `FlowProblems`);
 * - an error goes as soon as its field is edited;
 * - "Save and exit" (`intent=exit`) is never held up by a half-filled step: the server keeps
 *   what it can (UX-FL-2).
 *
 * `check` is the step's own rule, the same one the server uses, so the answer is the same both
 * sides. Spread `form` into `FlowShell`'s `form`, and key the fields on `attempt` so that what
 * was typed comes back after the server finds a problem.
 */
export function useFlowForm(
  action: (state: FormState, data: FormData) => Promise<FormState>,
  check?: (values: Record<string, string>) => Problems,
) {
  const [state, send, pending] = useActionState(action, emptyFormState);
  const [found, setFound] = useState<Problems | null>(null);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLFormElement>(null);

  // What the server found replaces what was found here, and focus goes to the first of it.
  const [answered, setAnswered] = useState(state.attempt);
  if (state.attempt !== answered) {
    setAnswered(state.attempt);
    setFound(null);
    setCount(Object.keys(state.errors ?? {}).length);
  }
  useEffect(() => {
    if (state.attempt === undefined) return;
    if (Object.keys(state.errors ?? {}).length > 0) focusFirstProblem(ref.current);
  }, [state.attempt, state.errors]);

  const errors: Problems = found ?? state.errors ?? {};
  const problemsNow = (): Problems =>
    check && ref.current ? check(formValues(new FormData(ref.current))) : {};

  const form: Pick<
    ComponentProps<'form'>,
    'action' | 'noValidate' | 'onChange' | 'onBlur' | 'onSubmit'
  > & { ref: typeof ref } = {
    ref,
    action: send,
    noValidate: true,
    onChange: (event: FormEvent<HTMLFormElement>) => {
      const name = (event.target as unknown as HTMLInputElement).name;
      if (name && errors[name]) {
        setFound((now) => {
          const { [name]: _fixed, ...rest } = now ?? errors;
          return rest;
        });
      }
    },
    onBlur: (event: FocusEvent<HTMLFormElement>) => {
      const field = event.target as unknown as HTMLInputElement;
      const problem = problemOnLeaving(
        { name: field.name ?? '', value: field.value ?? '' },
        problemsNow(),
      );
      if (problem) setFound((now) => ({ ...(now ?? errors), [field.name]: problem }));
    },
    onSubmit: (event: FormEvent<HTMLFormElement>) => {
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      if (submitter?.name === 'intent' && submitter.value === 'exit') return;
      const problems = problemsNow();
      const many = Object.keys(problems).length;
      if (many === 0) return;
      event.preventDefault();
      setFound(problems);
      setCount(many);
      focusFirstProblem(ref.current);
    },
  };

  return {
    form,
    errors,
    /** How many fields the last press of the button found wrong. */
    count,
    /** What was typed, after the server sent the step back. */
    values: state.values,
    /** Changes each time the server answers: key the fields on it. */
    attempt: state.attempt ?? 'first',
    /** The form has been sent and the server hasn't answered yet. */
    pending,
    state,
  };
}
