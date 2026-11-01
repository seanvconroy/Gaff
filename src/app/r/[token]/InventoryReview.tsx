import { conditions } from '@/domain/tenancy/movein';
import { formatDate } from '@/lib/format';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { confirmInventoryAction } from './inventory-actions';

type Item = {
  id: string;
  room: string;
  item: string;
  condition: keyof typeof conditions;
  note: string | null;
  hasPhoto: boolean;
};

/** R25: the move-in inventory, on the tenant's phone, to look over and confirm. */
export function InventoryReview({
  token,
  operatorName,
  items,
  confirmedAt,
}: {
  token: string;
  operatorName: string;
  items: Item[];
  confirmedAt: Date | null;
}) {
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <h2 className="type-title">Your move-in inventory</h2>
        <p>
          What’s in the home, and its condition, room by room. It helps when your deposit is
          returned, so it’s worth a careful look.
        </p>
      </Stack>
      <Card>
        <ul className={styles.inventory}>
          {items.map((item) => (
            <li key={item.id} className={styles.inventoryItem}>
              {item.hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/r/${token}/photos/${item.id}`}
                  alt={`${item.item}, ${item.room}`}
                  className={styles.inventoryPhoto}
                />
              ) : null}
              <span>
                <strong>
                  {item.room}: {item.item}
                </strong>{' '}
                <StatusPill tone={item.condition === 'damaged' ? 'warning' : 'neutral'}>
                  {conditions[item.condition]}
                </StatusPill>
                {item.note ? <span className={styles.muted}> {item.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {confirmedAt ? (
        <Notice tone="success" title="You’ve confirmed it" role="status">
          <p>On {formatDate(confirmedAt)}. Thank you.</p>
        </Notice>
      ) : (
        <Stack gap={3}>
          <form action={confirmInventoryAction.bind(null, token)}>
            <SubmitButton fullWidth pendingLabel="Confirming…">
              This is a fair record
            </SubmitButton>
          </form>
          <p>
            If anything isn’t right, reply to our email and {operatorName} will sort it out with
            you.
          </p>
        </Stack>
      )}
    </Stack>
  );
}
