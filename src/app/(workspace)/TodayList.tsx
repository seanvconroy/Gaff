import {
  CalendarClock,
  ClipboardList,
  FileSignature,
  Handshake,
  Inbox,
  type LucideIcon,
  MapPin,
  MessageCircleQuestionMark,
  RotateCcw,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import type { TodayItem } from '@/domain/dashboard/today';
import { formatDate } from '@/lib/format';
import { ActionList, ActionRow, type TileTone } from '@/ui/ActionList';

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`);
const tenancyStepWords = {
  send_agreement: 'send the tenancy agreement',
  sign_agreement: 'sign the tenancy agreement',
  request_payment: 'ask for the deposit and first month’s rent',
  confirm_payment: 'check the payment has arrived',
  finish: 'finish and close the letting',
} as const;

/** Each row's icon tile: AI drafts in the AI colours, deadlines in warning, the rest quiet. */
const icons: Record<TodayItem['kind'], { Icon: LucideIcon; tone: TileTone }> = {
  approvals: { Icon: Sparkles, tone: 'ai' },
  attention: { Icon: Inbox, tone: 'quiet' },
  questions: { Icon: MessageCircleQuestionMark, tone: 'quiet' },
  attendance: { Icon: UserCheck, tone: 'quiet' },
  choose: { Icon: Users, tone: 'quiet' },
  tenancy: { Icon: FileSignature, tone: 'quiet' },
  rtb: { Icon: CalendarClock, tone: 'warning' },
  offer: { Icon: Handshake, tone: 'quiet' },
  rechoose: { Icon: RotateCcw, tone: 'warning' },
  shortlist: { Icon: Users, tone: 'quiet' },
  pin: { Icon: MapPin, tone: 'quiet' },
  setup: { Icon: ClipboardList, tone: 'quiet' },
};

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * R28: what one thing that needs a person says, and where it's done. On the dashboard each
 * line starts with the home's address; on the home's own page it doesn't need to.
 */
export function todayLink(item: TodayItem, withAddress = true): { href: string; text: string } {
  const about = (address: string, what: string) =>
    withAddress ? `${address}: ${what}` : capitalise(what);
  switch (item.kind) {
    case 'approvals':
      return {
        href: '/approvals',
        text: `${item.count} ${item.count === 1 ? 'answer' : 'answers'} to approve`,
      };
    case 'attention':
      return {
        href: '/attention',
        text: `${item.count} ${item.count === 1 ? 'email needs' : 'emails need'} your attention`,
      };
    case 'questions':
      return {
        href: '/questions',
        text: `${item.count} ${item.count === 1 ? 'question' : 'questions'} only you can answer`,
      };
    case 'attendance':
      return {
        href: `/lettings/${item.lettingId}/attendance`,
        text: about(item.address, `mark who came (${people(item.count)})`),
      };
    case 'choose':
      return {
        href: `/lettings/${item.lettingId}/applications`,
        text: about(item.address, `choose who to offer it to (${item.count} applied)`),
      };
    case 'tenancy':
      return {
        href: `/lettings/${item.lettingId}/tenancy`,
        text: about(item.address, tenancyStepWords[item.step]),
      };
    case 'rtb':
      return {
        href: `/lettings/${item.lettingId}/tenancy`,
        text: about(item.address, `register with the RTB by ${formatDate(item.dueBy)}`),
      };
    case 'offer':
      return {
        href: `/lettings/${item.lettingId}/applications`,
        text: about(item.address, 'make the offer'),
      };
    case 'rechoose':
      return {
        href: `/lettings/${item.lettingId}/applications`,
        text: about(item.address, 'choose again'),
      };
    case 'shortlist':
      return {
        href: `/lettings/${item.lettingId}/shortlist`,
        text: about(item.address, `decide who views (${people(item.count)} waiting)`),
      };
    case 'pin':
      return {
        href: `/lettings/${item.lettingId}/listing#location`,
        text: about(item.address, 'place the pin on the map'),
      };
    case 'setup':
      return {
        href: `/lettings/${item.lettingId}`,
        text: about(item.address, 'finish setting up'),
      };
  }
}

/** One hairline row per thing to do, each a whole-row link to where it's done. */
export function TodayList({
  items,
  withAddress = true,
  flush,
}: {
  items: readonly TodayItem[];
  withAddress?: boolean;
  flush?: boolean;
}) {
  return (
    <ActionList flush={flush}>
      {items.map((item) => {
        const key = `${item.kind}-${'lettingId' in item ? item.lettingId : 'all'}`;
        const { href, text } = todayLink(item, withAddress);
        const { Icon, tone } = icons[item.kind];
        return <ActionRow key={key} id={key} href={href} icon={Icon} tone={tone} title={text} />;
      })}
    </ActionList>
  );
}
