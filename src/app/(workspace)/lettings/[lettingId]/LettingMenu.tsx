'use client';

import {
  DoorClosed,
  ExternalLink,
  FlaskConical,
  History,
  Pencil,
  Repeat,
  Send,
  Share2,
  UserPlus,
  UserRoundCog,
} from 'lucide-react';
import { useTransition } from 'react';
import { addLettingCopy } from '@/copy/add-letting';
import { lettingPageCopy } from '@/copy/letting-page';
import { shareCopy } from '@/copy/owner';
import { teamCopy } from '@/copy/team';
import { TEST_ENQUIRIES } from '@/copy/test-copy';
import { letAgainAction } from '@/app/(task)/lettings/_flow/actions';
import { Menu, MenuItem } from '@/ui/Menu';
import { addTestEnquiriesAction } from './dev-actions';

const copy = lettingPageCopy.menu;

/**
 * UX-LP-5: a letting's menu of rare actions, beside its address. It holds: See it on Gaff (a live
 * home on Gaff, once its public page exists); Change the home's details; Share with the owner
 * (a home let for someone else: UX-OW-1); Share with a colleague (an admin on a team: UX-AG-13);
 * History; Close this letting (while it's live). A closed letting has "Let it again" (UX-LT-23).
 *
 * Two more belong to earlier packages and stay: "Send a test enquiry" until the first real one
 * arrives (UX-LT-24), and "Change lead" for whoever may change it (UX-AG-9).
 *
 * Where the development tools are on (never in production), a live letting also has "Add test
 * enquiries" (BA-1): five made-up renters enquire, and People opens to show them.
 */
export function LettingMenu({
  lettingId,
  address,
  seeOnGaff,
  testEnquiry,
  shareWithOwner,
  shareWithColleague,
  changeLead,
  close,
  letAgain,
  testEnquiries,
}: {
  lettingId: string;
  address: string;
  seeOnGaff: string | null;
  testEnquiry: boolean;
  shareWithOwner: boolean;
  shareWithColleague: boolean;
  changeLead: boolean;
  close: boolean;
  letAgain: boolean;
  /** BA-1: the development tools are on and the letting is live. */
  testEnquiries: boolean;
}) {
  const [starting, start] = useTransition();
  const here = `/lettings/${lettingId}`;
  return (
    <>
      <Menu label={`More for ${address}`}>
        {seeOnGaff ? (
          <MenuItem icon={ExternalLink} href={seeOnGaff}>
            {copy.seeOnGaff}
          </MenuItem>
        ) : null}
        {letAgain ? null : (
          <MenuItem icon={Pencil} href={`${here}?view=home`}>
            {copy.change}
          </MenuItem>
        )}
        {testEnquiry ? (
          <MenuItem icon={Send} href={`${here}/test-enquiry`}>
            {addLettingCopy.testEnquiry.menu}
          </MenuItem>
        ) : null}
        {shareWithOwner ? (
          <MenuItem icon={Share2} href={`${here}/owner`}>
            {shareCopy.menu}
          </MenuItem>
        ) : null}
        {shareWithColleague ? (
          <MenuItem icon={UserPlus} href="/settings/team/invite">
            {copy.shareWithColleague}
          </MenuItem>
        ) : null}
        {changeLead ? (
          <MenuItem icon={UserRoundCog} href={`${here}/lead`}>
            {teamCopy.help.menu}
          </MenuItem>
        ) : null}
        {testEnquiries ? (
          <MenuItem
            icon={FlaskConical}
            onSelect={() => start(() => addTestEnquiriesAction(lettingId))}
          >
            {TEST_ENQUIRIES.menu}
          </MenuItem>
        ) : null}
        <MenuItem icon={History} href={`${here}/history`}>
          {copy.history}
        </MenuItem>
        {close ? (
          <MenuItem icon={DoorClosed} href={`${here}/close`}>
            {copy.close}
          </MenuItem>
        ) : null}
        {letAgain ? (
          <MenuItem icon={Repeat} onSelect={() => start(() => letAgainAction(lettingId))}>
            {addLettingCopy.letAgain.menu}
          </MenuItem>
        ) : null}
      </Menu>
      <p className="visually-hidden" role="status">
        {starting ? (letAgain ? addLettingCopy.letAgain.starting : TEST_ENQUIRIES.adding) : ''}
      </p>
    </>
  );
}
