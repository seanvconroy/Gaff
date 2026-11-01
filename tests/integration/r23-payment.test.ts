import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events, messages, tenancies } from '@/db/schema';
import { UserFacingError } from '@/server/errors';
import { loadRenterPage } from '@/server/renter/answers';
import { confirmPayment, requestPayment, setPaymentAccount } from '@/server/tenancy/payment';
import { markSignedOnPaper } from '@/server/tenancy/tenancy';
import { aLetHome, createTestMember } from './helpers';

const IBAN = 'IE29 AIBK 9311 5212 3456 78';
const dueDate = '2026-11-28';

describe('R23: where tenants pay', () => {
  it('is set by an admin, checked, and logged without the IBAN', async () => {
    const member = await createTestMember();
    await expect(
      setPaymentAccount({ ...member, role: 'negotiator' }, { accountName: 'X', iban: IBAN }),
    ).rejects.toThrow(UserFacingError);
    expect(
      await setPaymentAccount(member, { accountName: 'Client account', iban: 'IE00' }),
    ).toMatchObject({
      ok: false,
    });
    expect(await setPaymentAccount(member, { accountName: 'Client account', iban: IBAN })).toEqual({
      ok: true,
    });
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'settings.payment_account')),
    );
    expect(JSON.stringify(logged[0]!.data)).not.toMatch(/IE29|AIBK/);
  });
});

describe('R23: asking for the deposit and first month’s rent', () => {
  it('waits for the signed agreement and an account, then asks, with the details only on the private page', async () => {
    const member = await createTestMember();
    const { lettingId, tenantId, tenantToken } = await aLetHome(member);
    await expect(requestPayment(member, lettingId, { dueDate })).rejects.toThrow(
      'Ask for payment once the agreement is signed.',
    );
    await markSignedOnPaper(member, lettingId);
    await expect(requestPayment(member, lettingId, { dueDate })).rejects.toThrow(
      'Add the account tenants pay into, in Settings, first.',
    );
    await setPaymentAccount(member, { accountName: 'Halcyon client account', iban: IBAN });
    await expect(requestPayment(member, lettingId, { dueDate: '2020-01-01' })).rejects.toThrow(
      'Choose a date from today on.',
    );
    await requestPayment(member, lettingId, { dueDate });

    const [email] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, tenantId), eq(messages.kind, 'payment_request'))),
    );
    expect(email!.body).toContain('please pay €3,700 by Saturday 28 November');
    expect(email!.body).not.toMatch(/IE29|AIBK|Halcyon client account/);
    const page = await loadRenterPage(tenantToken);
    expect(page!.payTo).toEqual({
      accountName: 'Halcyon client account',
      iban: 'IE29AIBK93115212345678',
    });
    expect(page!.tenancy!.paymentReference).toMatch(/^GAFF-[A-Z0-9]+$/);

    await confirmPayment(member, lettingId);
    const [tenancy] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId)),
    );
    expect(tenancy).toMatchObject({ paymentConfirmedBy: member.userId });
    expect(tenancy!.paymentReceivedAt).toBeInstanceOf(Date);
    const [receipt] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, tenantId), eq(messages.kind, 'payment_received'))),
    );
    expect(receipt!.subject).toBe('12 Ranelagh Road: payment received');
  });
});
