import { desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import { confirmations, devOutbox, events, organisations } from '@/db/schema';
import {
  ConfirmationNeeded,
  confirmWithCode,
  findConfirmation,
  grantConfirmation,
  purgeOldConfirmations,
  sendConfirmationCode,
  spendConfirmation,
} from '@/server/auth/confirm';
import { setPaymentAccount } from '@/server/tenancy/payment';
import { confirmedAgain, createTestMember, type Member } from './helpers';

/**
 * UX-SI-10: "Confirm it's you again", as the server enforces it. Changing the account tenants
 * pay into is saved only by spending a confirmation, in the same transaction.
 */
const account = { accountName: 'Halcyon client account', iban: 'IE29 AIBK 9311 5212 3456 78' };
const SAVED_IBAN = 'IE29AIBK93115212345678';
const MINUTE = 60_000;

const user = (member: Member) => ({ id: member.userId, email: member.email });

async function ibanOf(member: Member): Promise<string | null> {
  const [organisation] = await db()
    .select({ iban: organisations.paymentIban })
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  return organisation!.iban;
}

/** The code in the newest "confirm it's you" email to this address. */
async function codeSentTo(email: string): Promise<string> {
  const [mail] = await db()
    .select({ subject: devOutbox.subject })
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, email))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  expect(mail!.subject).toMatch(/^\d{6} is your code to confirm it’s you$/);
  return mail!.subject.slice(0, 6);
}

/** Confirms by email code, as the sheet does, and returns the browser's grant. */
async function confirmByCode(member: Member, action = 'change_payment_account' as const) {
  const sent = await sendConfirmationCode(user(member), action, null);
  if (!sent.sent) throw new Error(`the code was not sent: ${sent.reason}`);
  const result = await confirmWithCode(
    user(member),
    action,
    sent.browserKey,
    await codeSentTo(member.email),
  );
  if (result.result !== 'correct') throw new Error(`not confirmed: ${result.result}`);
  return result.grant;
}

describe('UX-SI-10: changing the account tenants pay into needs a fresh confirmation', () => {
  it('saves nothing without one, whatever the age of the session', async () => {
    const member = await createTestMember();
    expect(await setPaymentAccount(member, account, null)).toEqual({ ok: false, confirm: true });
    expect(await ibanOf(member)).toBeNull();
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'settings.payment_account')),
    );
    expect(logged).toEqual([]);
  });

  it('checks the details first, so a typing mistake doesn’t cost a confirmation', async () => {
    const member = await createTestMember();
    const confirmation = await confirmedAgain(member);
    expect(
      await setPaymentAccount(member, { ...account, iban: 'IE00' }, confirmation),
    ).toMatchObject({ ok: false, errors: { iban: expect.any(String) } });
    // The same confirmation still saves the corrected details.
    expect(await setPaymentAccount(member, account, confirmation)).toEqual({ ok: true });
    expect(await ibanOf(member)).toBe(SAVED_IBAN);
  });

  it('saves with a fresh email code, logs how they confirmed, and spends the confirmation', async () => {
    const member = await createTestMember();
    const grant = await confirmByCode(member);
    const confirmation = await findConfirmation(member.userId, 'change_payment_account', grant);
    expect(confirmation).toMatchObject({ userId: member.userId, method: 'email_code' });

    expect(await setPaymentAccount(member, account, confirmation)).toEqual({ ok: true });
    expect(await ibanOf(member)).toBe(SAVED_IBAN);
    const [logged] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'settings.payment_account')),
    );
    expect(logged!.data).toEqual({ changed: true, confirmedBy: 'email_code' });
    expect(JSON.stringify(logged)).not.toMatch(/IE29|AIBK/);

    // It works once: the same confirmation, and the same grant, change nothing more.
    const other = { accountName: 'Another account', iban: 'IE64 IRCE 9205 0112 3456 78' };
    expect(await setPaymentAccount(member, other, confirmation)).toEqual({
      ok: false,
      confirm: true,
    });
    expect(await findConfirmation(member.userId, 'change_payment_account', grant)).toBeNull();
    expect(await ibanOf(member)).toBe(SAVED_IBAN);
  });

  it('lasts five minutes', async () => {
    const member = await createTestMember();
    const at = new Date();
    const grant = await grantConfirmation(member.userId, 'change_payment_account', 'passkey', at);
    const later = (minutes: number) => new Date(at.getTime() + minutes * MINUTE);
    expect(
      await findConfirmation(member.userId, 'change_payment_account', grant, later(4.9)),
    ).not.toBeNull();
    expect(
      await findConfirmation(member.userId, 'change_payment_account', grant, later(5)),
    ).toBeNull();

    // Found in time but spent too late: nothing is changed.
    const confirmation = await findConfirmation(member.userId, 'change_payment_account', grant);
    await expect(
      db().transaction((tx) =>
        spendConfirmation(tx, confirmation, 'change_payment_account', member.userId, later(6)),
      ),
    ).rejects.toThrow(ConfirmationNeeded);
  });

  it('is for one person and one action', async () => {
    const ann = await createTestMember();
    const ben = await createTestMember({ name: 'Ben Walsh' });
    const grant = await grantConfirmation(ann.userId, 'change_payment_account', 'passkey');
    // Someone else holding Ann's grant has confirmed nothing.
    expect(await findConfirmation(ben.userId, 'change_payment_account', grant)).toBeNull();
    // Ann's confirmation is for this action, not the next one.
    expect(await findConfirmation(ann.userId, 'remove_member', grant)).toBeNull();
    expect(await findConfirmation(ann.userId, 'delete_agency', grant)).toBeNull();
    for (const notAGrant of [undefined, null, '', 'guess', 'x'.repeat(43)]) {
      expect(await findConfirmation(ann.userId, 'change_payment_account', notAGrant)).toBeNull();
    }

    // Ann's confirmation can't save Ben's account, even if it's handed to his use case.
    const anns = await confirmedAgain(ann);
    expect(await setPaymentAccount(ben, account, anns)).toEqual({ ok: false, confirm: true });
    expect(await ibanOf(ben)).toBeNull();
    // Nor does a confirmation for another action save this one.
    const forRemoval = await confirmedAgain(ann, 'remove_member');
    expect(await setPaymentAccount(ann, account, forRemoval)).toEqual({
      ok: false,
      confirm: true,
    });
    expect(await ibanOf(ann)).toBeNull();
  });

  it('still takes an admin: confirming doesn’t widen who can change it', async () => {
    const member = await createTestMember();
    const confirmation = await confirmedAgain(member);
    await expect(
      setPaymentAccount({ ...member, role: 'negotiator' }, account, confirmation),
    ).rejects.toThrow('Only an admin can change this.');
    expect(await ibanOf(member)).toBeNull();
  });

  it('keeps only a hash of the browser’s grant', async () => {
    const member = await createTestMember();
    const grant = await grantConfirmation(member.userId, 'change_payment_account', 'passkey');
    const stored = await db()
      .select()
      .from(confirmations)
      .where(eq(confirmations.userId, member.userId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.grantHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(grant);
  });
});

describe('UX-SI-10: the email code that confirms it’s you', () => {
  it('goes to the person’s own address, names the action, and has no button', async () => {
    const member = await createTestMember();
    await sendConfirmationCode(user(member), 'change_payment_account', null);
    const [mail] = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, member.email));
    expect(mail!.text).toContain(
      'You asked to change the account tenants pay into, in Gaff. To confirm it’s you, enter this code:',
    );
    expect(mail!.text).not.toMatch(/https?:\/\//);
    expect(mail!.text).not.toContain('!');
  });

  it('confirms nothing with a wrong code, another browser, or a code for another action', async () => {
    const member = await createTestMember();
    const sent = await sendConfirmationCode(user(member), 'change_payment_account', null);
    if (!sent.sent) throw new Error('not sent');
    const code = await codeSentTo(member.email);
    const wrong = code === '111111' ? '222222' : '111111';
    expect(
      await confirmWithCode(user(member), 'change_payment_account', sent.browserKey, wrong),
    ).toEqual({ result: 'wrong' });
    expect(
      await confirmWithCode(user(member), 'change_payment_account', 'b'.repeat(43), code),
    ).toEqual({ result: 'finished' });
    // The code was sent for changing the account: it removes nobody.
    expect(await confirmWithCode(user(member), 'remove_member', sent.browserKey, code)).toEqual({
      result: 'finished',
    });
    // Nor does it confirm for anyone else.
    const other = await createTestMember();
    expect(
      await confirmWithCode(user(other), 'change_payment_account', sent.browserKey, code),
    ).toEqual({ result: 'finished' });
    expect(
      await db().select().from(confirmations).where(eq(confirmations.userId, member.userId)),
    ).toEqual([]);
    // The right code, in the right browser, for the right action, still works.
    expect(
      await confirmWithCode(user(member), 'change_payment_account', sent.browserKey, code),
    ).toMatchObject({ result: 'correct' });
  });
});

describe('UX-SI-10: confirmations are deleted by the retention job (rule 9)', () => {
  it('deletes a confirmation a day after it ran out', async () => {
    const member = await createTestMember();
    const at = new Date('2026-11-14T12:00:00Z');
    await grantConfirmation(member.userId, 'change_payment_account', 'passkey', at);
    const mine = () =>
      db().select().from(confirmations).where(eq(confirmations.userId, member.userId));
    await withSystem((tx) => purgeOldConfirmations(tx, new Date(at.getTime() + 60 * MINUTE)));
    expect(await mine()).toHaveLength(1);
    await withSystem((tx) =>
      purgeOldConfirmations(tx, new Date(at.getTime() + 24 * 60 * MINUTE + 6 * MINUTE)),
    );
    expect(await mine()).toEqual([]);
  });
});
