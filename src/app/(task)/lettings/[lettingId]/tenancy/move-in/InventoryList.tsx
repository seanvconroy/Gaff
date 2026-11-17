import { tenancyCopy } from '@/copy/tenancy-steps';
import { conditions, needsALook, type Condition } from '@/domain/tenancy/movein';
import { StatusPill } from '@/ui/StatusPill';
import { removeItemAction } from '../actions';
import styles from './movein.module.css';
import { RemoveItem } from './RemoveItem';

const copy = tenancyCopy.moveIn;

interface Item {
  id: string;
  room: string;
  item: string;
  condition: string;
  note: string | null;
  tenantNote: string | null;
  hasPhoto: boolean;
}

/**
 * R25, UX-RN-25: the inventory as the operator sees it: each item, its condition in words, and
 * what the tenant said isn't right about it. `removable` puts a Remove button on each, until the
 * inventory is shared.
 */
export function InventoryList({
  lettingId,
  items,
  removable,
}: {
  lettingId: string;
  items: readonly Item[];
  removable: boolean;
}) {
  return (
    <ul className={styles.list} aria-label={copy.inventory}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          {item.hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/lettings/${lettingId}/tenancy/photos/${item.id}`}
              alt={`${item.item}, ${item.room}`}
              className={styles.photo}
            />
          ) : (
            <span className={styles.noPhoto} aria-hidden="true" />
          )}
          <span className={styles.itemText}>
            <strong>
              {item.room}: {item.item}
            </strong>
            <span>
              <StatusPill tone={needsALook(item.condition) ? 'warning' : 'neutral'}>
                {conditions[item.condition as Condition] ?? item.condition}
              </StatusPill>
              {item.note ? <span className={styles.note}> {item.note}</span> : null}
            </span>
            {item.tenantNote ? (
              <span>
                <StatusPill tone="warning">{copy.tenantSays}</StatusPill>
                <span className={styles.note}> {item.tenantNote}</span>
              </span>
            ) : null}
          </span>
          {removable ? (
            <RemoveItem
              remove={removeItemAction.bind(null, lettingId, item.id)}
              label={copy.remove}
              what={item.item}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
