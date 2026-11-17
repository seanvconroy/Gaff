'use client';

import { Repeat, Send, Share2 } from 'lucide-react';
import { useTransition } from 'react';
import { addLettingCopy } from '@/copy/add-letting';
import { shareCopy } from '@/copy/owner';
import { letAgainAction } from '@/app/(task)/lettings/_flow/actions';
import { Menu, MenuItem } from '@/ui/Menu';

/**
 * A letting's menu of rare actions, beside its address. "Send a test enquiry" is there for a
 * live letting until its first real enquiry arrives (UX-LT-24); "Share with the owner" for any
 * home let for someone else, from the day it's added (UX-OW-1, UX-OW-2); "Let it again" once the
 * letting is closed (UX-LT-23). With none of them, there is no menu.
 */
export function LettingMenu({
  lettingId,
  address,
  testEnquiry,
  shareWithOwner,
  letAgain,
}: {
  lettingId: string;
  address: string;
  testEnquiry: boolean;
  shareWithOwner: boolean;
  letAgain: boolean;
}) {
  const [starting, start] = useTransition();
  if (!testEnquiry && !shareWithOwner && !letAgain) return null;
  return (
    <>
      <Menu label={`More for ${address}`}>
        {testEnquiry ? (
          <MenuItem icon={Send} href={`/lettings/${lettingId}/test-enquiry`}>
            {addLettingCopy.testEnquiry.menu}
          </MenuItem>
        ) : null}
        {shareWithOwner ? (
          <MenuItem icon={Share2} href={`/lettings/${lettingId}/owner`}>
            {shareCopy.menu}
          </MenuItem>
        ) : null}
        {letAgain ? (
          <MenuItem icon={Repeat} onSelect={() => start(() => letAgainAction(lettingId))}>
            {addLettingCopy.letAgain.menu}
          </MenuItem>
        ) : null}
      </Menu>
      <p className="visually-hidden" role="status">
        {starting ? addLettingCopy.letAgain.starting : ''}
      </p>
    </>
  );
}
