import {
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { applications } from './enquiries';
import { lettings } from './lettings';
import { offers } from './offers';
import { organisations } from './organisations';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Stages 8 and 9 (R22 to R26): one tenancy per let home. The agreement and both signatures,
 * the payment request (to the operator's own account; Gaff never holds money), the optional
 * PPSN for RTB registration (sealed, deleted once registered), move-in, and closing.
 */
export const tenancies = pgTable(
  'tenancies',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    lettingId: uuid()
      .notNull()
      .references(() => lettings.id),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id),
    offerId: uuid()
      .notNull()
      .references(() => offers.id),
    startDate: date({ mode: 'string' }).notNull(),
    rentCents: integer().notNull(),
    depositCents: integer().notNull(),
    agreementStatus: text({
      enum: ['draft', 'with_tenant', 'tenant_signed', 'signed', 'signed_on_paper'],
    })
      .notNull()
      .default('draft'),
    agreementTemplate: text(),
    agreementHash: text(),
    agreementSentAt: timestamp({ withTimezone: true }),
    tenantSignedAt: timestamp({ withTimezone: true }),
    tenantSignedName: text(),
    operatorSignedAt: timestamp({ withTimezone: true }),
    operatorSignedBy: text().references(() => users.id),
    signedDecisionId: uuid(),
    paymentRequestedAt: timestamp({ withTimezone: true }),
    paymentDueDate: date({ mode: 'string' }),
    paymentReference: text(),
    paymentReceivedAt: timestamp({ withTimezone: true }),
    paymentConfirmedBy: text().references(() => users.id),
    ppsnSealed: text(),
    ppsnGivenAt: timestamp({ withTimezone: true }),
    rtbRegisteredAt: timestamp({ withTimezone: true }),
    rtbRegisteredBy: text().references(() => users.id),
    rtbReference: text(),
    moveInChecklist: jsonb().$type<Record<string, string>>(),
    moveInCompletedAt: timestamp({ withTimezone: true }),
    inventorySharedAt: timestamp({ withTimezone: true }),
    inventoryConfirmedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('tenancies_letting_idx').on(t.lettingId), tenantPolicy()],
).enableRLS();

/** R25: the move-in inventory, room by room, with a photo where it helps. */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    tenancyId: uuid()
      .notNull()
      .references(() => tenancies.id, { onDelete: 'cascade' }),
    room: text().notNull(),
    item: text().notNull(),
    condition: text({ enum: ['new', 'good', 'fair', 'worn', 'damaged'] }).notNull(),
    note: text(),
    photo: bytea(),
    photoType: text(),
    createdAt: createdAt(),
  },
  (t) => [index('inventory_items_tenancy_idx').on(t.organisationId, t.tenancyId), tenantPolicy()],
).enableRLS();
