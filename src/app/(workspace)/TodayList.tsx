import {
  CalendarClock,
  ClipboardList,
  FileSignature,
  Handshake,
  Inbox,
  type LucideIcon,
  MessageCircleQuestionMark,
  RotateCcw,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import type { TodayKind } from '@/domain/dashboard/today';
import type { TodayRow } from '@/domain/dashboard/today-rows';
import { ActionList, ActionRow, type TileTone } from '@/ui/ActionList';
import { Avatar } from '@/ui/Avatar';
import styles from './dashboard.module.css';

/** Each row's icon tile: AI drafts in the AI colours, deadlines in warning, the rest quiet. */
const icons: Record<TodayKind, { Icon: LucideIcon; tone: TileTone }> = {
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
  setup: { Icon: ClipboardList, tone: 'quiet' },
};

/**
 * UX-HM-3: one row per thing that needs a person. The first line is the task and the home; the
 * second is why now. The whole row is one link to where the task is done.
 *
 * UX-HM-11: with `leads`, each row also names who leads its home, for an admin's "Everyone".
 * A row that belongs to no home, such as an email Gaff couldn't place, names nobody.
 */
export function TodayList({
  rows,
  leads,
  flush,
  bare,
  labelledBy,
}: {
  rows: readonly TodayRow[];
  /** Who leads each row's home, by the lead's user ID: their name, and what to call them. */
  leads?: ReadonlyMap<string, { name: string; label: string }>;
  flush?: boolean;
  bare?: boolean;
  labelledBy?: string;
}) {
  return (
    <ActionList flush={flush} bare={bare} labelledBy={labelledBy}>
      {rows.map((row) => {
        const { Icon, tone } = icons[row.kind];
        const lead = row.leadUserId ? leads?.get(row.leadUserId) : undefined;
        return (
          <ActionRow
            key={row.key}
            id={row.key}
            href={row.href}
            icon={Icon}
            tone={tone}
            title={row.title}
            meta={row.why ?? undefined}
            trailing={
              lead ? (
                <span className={styles.lead}>
                  <Avatar name={lead.name} size="small" />
                  <span>
                    <span className="visually-hidden">Lead: </span>
                    {lead.label}
                  </span>
                </span>
              ) : undefined
            }
          />
        );
      })}
    </ActionList>
  );
}
