'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { TimeSettings } from '@/domain/viewings/calendar';
import type { SuggestedTime } from '@/domain/viewings/suggestions';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Notice';
import { useToast } from '@/ui/Toast';
import { addSuggestedAction } from './actions';
import styles from './calendar.module.css';

/**
 * UX-VW-4: a home with people waiting and no viewing times gets two suggested times, each added
 * with one tap, with the home's last settings.
 */
export function Suggestions({
  homeId,
  heading,
  lead,
  suggestions,
  settings,
}: {
  homeId: string;
  heading: string;
  lead: string;
  suggestions: ReadonlyArray<SuggestedTime & { words: string }>;
  settings: TimeSettings | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [problem, setProblem] = useState('');
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState('');
  const headingId = `suggest-${homeId}`;

  const add = (suggestion: SuggestedTime) =>
    startTransition(async () => {
      setAdding(suggestion.date);
      const result = await addSuggestedAction(
        homeId,
        { date: suggestion.date, start: suggestion.start, end: suggestion.end },
        settings
          ? { kind: settings.kind, slotMinutes: settings.slotMinutes, capacity: settings.capacity }
          : undefined,
      );
      setAdding('');
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      toast.show({ message: result.message });
      router.replace(`${pathname}?day=${suggestion.date}`, { scroll: false });
    });

  return (
    <section className={styles.suggestions} aria-labelledby={headingId}>
      <div>
        <h2 id={headingId} className="type-heading">
          {heading}
        </h2>
        <p className={styles.muted}>{lead}</p>
      </div>
      <ul className={styles.suggestionList}>
        {suggestions.map((suggestion) => (
          <li key={suggestion.date} className={styles.suggestion}>
            <span>{suggestion.words}</span>
            <Button onClick={() => add(suggestion)} disabled={pending} aria-disabled={pending}>
              {adding === suggestion.date ? 'Adding…' : 'Add'}
              <span className="visually-hidden"> {suggestion.words}</span>
            </Button>
          </li>
        ))}
      </ul>
      {problem ? (
        <Notice tone="warning" role="alert">
          <p>{problem}</p>
        </Notice>
      ) : null}
    </section>
  );
}
