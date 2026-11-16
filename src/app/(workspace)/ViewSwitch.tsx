import type { View } from '@/domain/dashboard/views';
import { ChipLinks } from '@/ui/Chips';

/**
 * "Mine" and "Everyone" (UX-HM-11, UX-AG-8): two chips that are links, so the view is in the
 * address and the back button works. Only shown to someone who has both views; see
 * `todayViews` and `lettingsViews`.
 */
export function ViewSwitch({
  path,
  view,
  label,
}: {
  /** The page being switched: "/today" or "/lettings". */
  path: string;
  view: View;
  /** What the chips choose between, for screen readers: "Whose homes". */
  label: string;
}) {
  return (
    <ChipLinks
      label={label}
      items={[
        { href: path, label: 'Mine', current: view === 'mine' },
        { href: `${path}?view=everyone`, label: 'Everyone', current: view === 'everyone' },
      ]}
    />
  );
}
