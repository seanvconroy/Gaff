import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { decisions, events, lettings, messages, tenancies } from '@/db/schema';
import { UserFacingError } from '@/server/errors';
import {
  countersign,
  loadTenantAgreement,
  markSignedOnPaper,
  sendAgreement,
  signAsTenant,
  tenancyFor,
} from '@/server/tenancy/tenancy';
import { aLetHome, createTestMember } from './helpers';

type Member = Awaited<ReturnType<typeof createTestMember>>;

const tenancyOf = async (member: Member, lettingId: string) =>
  (await tenancyFor(member, lettingId))!.tenancy;

describe('R22: the tenancy agreement', () => {
  it('is set up from the accepted offer, and sent to the tenant to read and sign', async () => {
    const member = await createTestMember();
    const { lettingId, tenantId } = await aLetHome(member);
    const view = await tenancyFor(member, lettingId);
    expect(view!.tenancy).toMatchObject({
      agreementStatus: 'draft',
      startDate: '2026-12-01',
      rentCents: 185_000,
      depositCents: 185_000,
      applicationId: tenantId,
    });
    expect(view!.document.sections[0]!.paragraphs[0]).toBe(
      'Mary Byrne (the landlord), acting through their letting agent ' +
        `${member.organisationName}, PSRA licence 001234, and Renter 1 (the tenant).`,
    );
    await sendAgreement(member, lettingId);
    const sent = await tenancyOf(member, lettingId);
    expect(sent).toMatchObject({ agreementStatus: 'with_tenant', agreementHash: view!.hash });
    const [email] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, tenantId), eq(messages.kind, 'agreement_ready'))),
    );
    expect(email!.body).toMatch(/\/r\/[A-Za-z0-9_-]{43}\/agreement/);
  });

  it('is signed by the tenant, then by the operator for the landlord, as their decision', async () => {
    const member = await createTestMember();
    const { lettingId, tenantToken } = await aLetHome(member);
    await sendAgreement(member, lettingId);
    const { hash } = (await loadTenantAgreement(tenantToken))!;
    expect(
      await signAsTenant(tenantToken, { typedName: 'Someone Else', consent: 'yes', hash }),
    ).toEqual({
      ok: false,
      errors: { typedName: 'Type your name as it is on the agreement: Renter 1.' },
    });
    expect(await signAsTenant(tenantToken, { typedName: 'Renter 1', hash })).toMatchObject({
      ok: false,
      errors: { consent: 'Tick the box to sign electronically.' },
    });
    expect(
      await signAsTenant(tenantToken, { typedName: 'Renter 1', consent: 'yes', hash: 'x' }),
    ).toEqual({ ok: false, closed: true });
    expect(
      await signAsTenant(tenantToken, { typedName: 'renter 1', consent: 'yes', hash }),
    ).toEqual({ ok: true });
    expect((await tenancyOf(member, lettingId)).agreementStatus).toBe('tenant_signed');

    expect(await countersign(member, lettingId, { typedName: 'Not Me', consent: 'yes' })).toEqual({
      ok: false,
      errors: { typedName: 'Type your own name to sign: Ann Power.' },
    });
    expect(
      await countersign(member, lettingId, { typedName: 'Ann Power', consent: 'yes' }),
    ).toEqual({ ok: true });
    const signed = await tenancyOf(member, lettingId);
    expect(signed).toMatchObject({ agreementStatus: 'signed', operatorSignedBy: member.userId });
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.kind, 'sign_agreement')),
    );
    expect(decision!.basis).toEqual({
      tenancyId: signed.id,
      agreementHash: hash,
      mode: 'electronic',
    });
    const [logged] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'agreement.signed')),
    );
    expect(logged!.data).toMatchObject({ mode: 'electronic', decisionId: decision!.id });
  });

  it('can’t be signed if it changed after it was sent', async () => {
    const member = await createTestMember();
    const { lettingId, tenantToken } = await aLetHome(member);
    await sendAgreement(member, lettingId);
    const { hash } = (await loadTenantAgreement(tenantToken))!;
    await withOrg(member.organisationId, (tx) =>
      tx.update(tenancies).set({ rentCents: 190_000 }).where(eq(tenancies.lettingId, lettingId)),
    );
    expect((await loadTenantAgreement(tenantToken))!.unchanged).toBe(false);
    expect(
      await signAsTenant(tenantToken, { typedName: 'Renter 1', consent: 'yes', hash }),
    ).toEqual({ ok: false, closed: true });
  });

  it('can be signed on paper instead, recorded as the operator’s decision (Q23)', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLetHome(member);
    await markSignedOnPaper(member, lettingId);
    expect((await tenancyOf(member, lettingId)).agreementStatus).toBe('signed_on_paper');
    await expect(markSignedOnPaper(member, lettingId)).rejects.toThrow(UserFacingError);
    await expect(
      countersign(member, lettingId, { typedName: 'Ann Power', consent: 'yes' }),
    ).rejects.toThrow('The tenant needs to sign first.');
  });
});

describe('R22: the agreement names the landlord', () => {
  it('needs an agency to add the landlord before it can go out', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLetHome(member);
    await withOrg(member.organisationId, (tx) =>
      tx.update(lettings).set({ landlordId: null }).where(eq(lettings.id, lettingId)),
    );
    expect((await tenancyFor(member, lettingId))!.needsLandlord).toBe(true);
    await expect(sendAgreement(member, lettingId)).rejects.toThrow(
      'Add the landlord’s name first, so the agreement names them.',
    );
    await expect(markSignedOnPaper(member, lettingId)).rejects.toThrow(UserFacingError);
  });
});
