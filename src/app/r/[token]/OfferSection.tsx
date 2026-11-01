import { formatDate, formatDateTime, formatEuro } from '@/lib/format';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { respondAction } from './offer-actions';

type Offer = {
  rentCents: number;
  depositCents: number;
  startDate: string;
  expiresAt: Date;
};

const problems: Record<string, string> = {
  expired: 'Sorry, the time to answer has passed, so the offer has closed.',
  not_open: 'This offer has already been answered.',
  link: 'This link isn’t working any more. Reply to our email and we’ll help.',
};

/**
 * R20: the offer, on the renter's phone. It names the only payments there are, says they go
 * directly to the operator, and says when to answer by (rules 4 and 5).
 */
export function OfferSection({
  token,
  operatorName,
  address,
  offer,
  confirmDecline,
  problem,
}: {
  token: string;
  operatorName: string;
  address: string;
  offer: Offer;
  confirmDecline: boolean;
  problem?: string;
}) {
  const rows: Array<[string, string]> = [
    ['Rent', `${formatEuro(offer.rentCents)} a month`],
    ['From', formatDate(offer.startDate)],
    ['Deposit', formatEuro(offer.depositCents)],
    ['First month’s rent', formatEuro(offer.rentCents)],
  ];
  return (
    <Stack gap={6}>
      {problem && problems[problem] ? (
        <Notice tone="warning" role="alert">
          <p>{problems[problem]}</p>
        </Notice>
      ) : null}
      <Stack gap={2}>
        <h2 className="type-title">An offer for {address}</h2>
        <p>Good news: {operatorName} would like to offer you the home.</p>
      </Stack>
      <Card>
        <dl className={styles.answers}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.answer}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <p>
        To secure the home, you’d pay the deposit and the first month’s rent directly to{' '}
        {operatorName}, once you’ve signed the tenancy agreement. There are no other fees, and
        nothing is paid through Gaff.
      </p>
      <Notice tone="info" title={`Please answer by ${formatDateTime(offer.expiresAt)}`}>
        <p>If we don’t hear from you by then, the offer closes.</p>
      </Notice>
      {confirmDecline ? (
        <Card>
          <Stack gap={4}>
            <h3 className="type-title">Decline the offer?</h3>
            <p>The home may then be offered to someone else. You can’t undo this.</p>
            <form action={respondAction.bind(null, token, 'decline')}>
              <SubmitButton variant="secondary" fullWidth pendingLabel="Declining…">
                Yes, decline the offer
              </SubmitButton>
            </form>
            <p>
              <a href={`/r/${token}`}>Go back</a>
            </p>
          </Stack>
        </Card>
      ) : (
        <Stack gap={4}>
          <form action={respondAction.bind(null, token, 'accept')}>
            <SubmitButton fullWidth pendingLabel="Accepting…">
              Accept the offer
            </SubmitButton>
          </form>
          <p>
            <a href={`/r/${token}?decline=1`}>Decline the offer</a>
          </p>
        </Stack>
      )}
    </Stack>
  );
}
