'use client';

import { RotateCw, X } from 'lucide-react';
import { useTransition } from 'react';
import { teamCopy } from '@/copy/team';
import { Menu, MenuItem } from '@/ui/Menu';
import { inviteAction } from './actions';

const copy = teamCopy.invited;

/** UX-AG-12: an invite's menu on Team: "Send again" and "Cancel". */
export function InviteMenu({ inviteId, email }: { inviteId: string; email: string }) {
  const [pending, start] = useTransition();
  return (
    <>
      <Menu label={copy.menu(email)}>
        <MenuItem icon={RotateCw} onSelect={() => start(() => inviteAction(inviteId, 'again'))}>
          {copy.again}
        </MenuItem>
        <MenuItem
          icon={X}
          destructive
          onSelect={() => start(() => inviteAction(inviteId, 'cancel'))}
        >
          {copy.cancel}
        </MenuItem>
      </Menu>
      <span className="visually-hidden" role="status">
        {pending ? 'Working…' : ''}
      </span>
    </>
  );
}
