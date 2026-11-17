import { CalendarPlus, ListChecks, MessageCircleQuestion, Users } from 'lucide-react';
import { promptCopy } from '@/copy/activation';
import { type Prompt as PromptShown, ruleFor } from '@/domain/activation/prompts';
import { withReturn } from '@/domain/navigation/return-to';
import { Button, ButtonLink } from '@/ui/Button';
import { Prompt } from '@/ui/Prompt';
import { declinePromptAction } from './prompt-actions';

/**
 * The one prompt a workspace screen shows (UX-GR-5, UX-GR-6), as a line in the page's content
 * with one action and, where it can wait, "Not now". Which prompt, if any, is `promptFor`'s
 * answer. Prompts drawn by their own screens (the checklist, the owner's link just after
 * go-live, the results screen's next action) aren't drawn here.
 */
export function PromptLine({ prompt, back }: { prompt: PromptShown | null; back: string }) {
  if (!prompt) return null;
  const shown = view(prompt, back);
  if (!shown) return null;
  const decline = ruleFor(prompt.code).declinable ? (
    <form action={declinePromptAction}>
      <input type="hidden" name="prompt" value={prompt.code} />
      <input type="hidden" name="back" value={back} />
      <Button type="submit" variant="quiet">
        {promptCopy.notNow}
        <span className="visually-hidden">{promptCopy.notNowFor(shown.title)}</span>
      </Button>
    </form>
  ) : undefined;
  return (
    <Prompt
      id={`prompt-${prompt.code.replaceAll('_', '-')}`}
      icon={shown.icon}
      title={shown.title}
      action={
        <ButtonLink href={shown.href} variant="secondary">
          {shown.action}
        </ButtonLink>
      }
      decline={decline}
    >
      <p>{shown.text}</p>
    </Prompt>
  );
}

function view(prompt: PromptShown, back: string) {
  switch (prompt.code) {
    case 'add_viewing_times':
      return {
        icon: CalendarPlus,
        ...promptCopy.add_viewing_times,
        text: promptCopy.add_viewing_times.text(prompt.address),
        href: `/lettings/${prompt.lettingId}/viewings`,
      };
    case 'invite_team':
      return {
        icon: Users,
        ...promptCopy.invite_team,
        href: withReturn('/settings/team/invite', back),
      };
    case 'stop_checking':
      return { icon: ListChecks, ...promptCopy.stop_checking, href: '/settings/assistant' };
    case 'answer_more':
      return {
        icon: MessageCircleQuestion,
        ...promptCopy.answer_more,
        href: `/lettings/${prompt.lettingId}?view=home`,
      };
    default:
      return null;
  }
}
