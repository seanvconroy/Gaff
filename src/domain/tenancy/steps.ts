/**
 * Stage 8 and 9: what the operator does next on a let home, and when it can be closed. Used by
 * the Tenancy tab and "Needs you today" (R28).
 */
export interface TenancyProgress {
  agreementStatus: string;
  paymentRequestedAt: Date | null;
  paymentReceivedAt: Date | null;
  moveInCompletedAt: Date | null;
  closedAt: Date | null;
}

export type TenancyStep =
  'send_agreement' | 'sign_agreement' | 'request_payment' | 'confirm_payment' | 'finish';

const signed = (t: TenancyProgress) => ['signed', 'signed_on_paper'].includes(t.agreementStatus);

/** Null when it's the tenant's turn, or when it's all done. */
export function nextTenancyStep(t: TenancyProgress): TenancyStep | null {
  if (t.closedAt) return null;
  if (t.agreementStatus === 'draft') return 'send_agreement';
  if (t.agreementStatus === 'tenant_signed') return 'sign_agreement';
  if (!signed(t)) return null;
  if (!t.paymentRequestedAt) return 'request_payment';
  if (!t.paymentReceivedAt) return 'confirm_payment';
  if (t.moveInCompletedAt) return 'finish';
  return null;
}

/** R26: a let home closes once the agreement is signed and the money is in. */
export function canFinish(t: TenancyProgress): boolean {
  return signed(t) && t.paymentReceivedAt !== null && t.closedAt === null;
}

/** R26 (Q3): the anonymous record is kept this many months, then deleted. */
export function recordCutoff(now: Date, months: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}
