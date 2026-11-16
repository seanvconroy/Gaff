import { tenancyCopy } from '@/copy/renter';
import { byRoom, conditions } from '@/domain/tenancy/movein';
import type { RenterModel } from '@/server/renter/model';
import { ButtonLink } from '@/ui/Button';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { confirmInventoryAction } from './inventory-actions';
import { ItemQuery } from './ItemQuery';
import { Task } from './Task';

const copy = tenancyCopy.inventory;

export interface InventoryItem {
  id: string;
  room: string;
  item: string;
  condition: keyof typeof conditions;
  note: string | null;
  /** What the tenant has said isn't right about it, if anything. */
  tenantNote: string | null;
  hasPhoto: boolean;
}

/**
 * R25, UX-RN-25: the move-in inventory, room by room, on the tenant's phone. Each item has
 * "Something's not right", which opens a short note to the lister about that item. The page's
 * one primary action is "This is a fair record".
 */
export function InventoryPage({
  token,
  model,
  items,
  confirmedOn,
}: {
  token: string;
  model: RenterModel;
  items: readonly InventoryItem[];
  /** "Tuesday 15 December", once they've confirmed it. */
  confirmedOn: string | null;
}) {
  const { operator } = model;
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{confirmedOn ? copy.confirmedNext(operator) : copy.next(operator)}</p>}
    >
      <Task title={copy.title} lead={copy.lead}>
        {confirmedOn ? (
          <Outcome tone="success" title={copy.confirmed} role="status">
            <p>{copy.confirmedText(confirmedOn)}</p>
          </Outcome>
        ) : null}
        <div className={styles.rooms}>
          {byRoom(items).map((room) => (
            <section key={room.room} className={styles.group} aria-label={room.room}>
              <h3 className="type-title">{room.room}</h3>
              <ul className={styles.items}>
                {room.items.map((item) => (
                  <li key={item.id} className={styles.item}>
                    <div className={item.hasPhoto ? styles.itemHead : undefined}>
                      {item.hasPhoto ? (
                        // A tenant's own photo route: sized by the page, not optimised by Next.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/r/${token}/photos/${item.id}`}
                          alt={`${item.item}, ${item.room}`}
                          className={styles.itemPhoto}
                        />
                      ) : null}
                      <div className={styles.itemText}>
                        <span className={styles.itemName}>{item.item}</span>
                        <StatusPill
                          tone={item.condition === 'damaged' ? 'warning' : 'neutral'}
                          large
                        >
                          {conditions[item.condition]}
                        </StatusPill>
                        {item.note ? <span className={styles.muted}>{item.note}</span> : null}
                      </div>
                    </div>
                    {item.tenantNote ? (
                      <p className={styles.said}>
                        <span className={styles.saidLabel}>{copy.youSaid}</span>
                        <span>{item.tenantNote}</span>
                      </p>
                    ) : null}
                    <div>
                      <ItemQuery
                        token={token}
                        itemId={item.id}
                        item={item.item}
                        operator={operator}
                        note={item.tenantNote}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {confirmedOn ? (
          <div className={styles.actions}>
            <ButtonLink href={`/r/${token}`} variant="quiet" fullWidth="phone">
              {tenancyCopy.agreement.back}
            </ButtonLink>
          </div>
        ) : (
          <form action={confirmInventoryAction.bind(null, token)} className={styles.actions}>
            <SubmitButton fullWidth="phone" pendingLabel={copy.confirming}>
              {copy.button}
            </SubmitButton>
          </form>
        )}
      </Task>
    </PrivateFrame>
  );
}
