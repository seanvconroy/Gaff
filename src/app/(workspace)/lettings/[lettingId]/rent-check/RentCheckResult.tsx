import { formatDate, formatEuro, formatRent } from '@/lib/format';
import type { RentCheckRow } from '@/server/lettings/rent-check';
import { Notice } from '@/ui/Notice';

const capText = (check: RentCheckRow) =>
  check.previousRentCents && check.previousRentSetOn
    ? `It can rise from ${formatEuro(check.previousRentCents)} (set on ${formatDate(check.previousRentSetOn)}) by no more than inflation, up to 2% a year. Check the exact figure with the RTB’s rent calculator.`
    : 'It can rise by no more than inflation, up to 2% a year.';

/** The rent check's answer in plain words, with what to do next. Not legal advice. */
export function RentCheckResult({
  check,
  askingRentCents,
  ceilingCents,
}: {
  check: RentCheckRow;
  askingRentCents: number;
  ceilingCents: number | null;
}) {
  return (
    <>
      {check.result === 'market' ? (
        <Notice tone="success" title="Market rent can be set">
          <p>
            {check.reason === 'first_letting'
              ? 'This is the home’s first letting, so there’s no previous rent to cap.'
              : 'The last tenancy began under the new rules and the tenant ended it, so the rent can be reset.'}{' '}
            You’ll need three comparable rents from the RTB Rent Register.
          </p>
        </Notice>
      ) : null}
      {check.result === 'capped' ? (
        <Notice tone="info" title="The rent cap applies">
          <p>
            {check.reason === 'tenancy_before_new_rules'
              ? 'The last tenancy began before 1 March 2026, so the rent can’t be reset to market.'
              : 'The landlord ended the last tenancy, so the rent can’t be reset to market.'}{' '}
            {capText(check)}
          </p>
        </Notice>
      ) : null}
      {check.result === 'get_advice' ? (
        <Notice tone="warning" title="Get advice before you set the rent">
          <p>
            Homes that have been substantially changed may be treated differently. Ask your
            solicitor or the RTB before you advertise.
          </p>
        </Notice>
      ) : null}
      {ceilingCents !== null ? (
        <Notice tone="warning" title="The rent is more than the cap allows">
          <p>
            You’re asking {formatRent(askingRentCents)}. Even at the 2% maximum, the rent can be at
            most {formatRent(ceilingCents)}. Change the rent here and on the advert before Gaff
            takes enquiries.
          </p>
        </Notice>
      ) : null}
    </>
  );
}
