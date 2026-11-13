import { bigint, boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { mediaKinds } from '@/domain/media/photos';
import { users } from './auth';
import { createdAt, tenantPolicy, updatedAt } from './columns';
import { developments, homes } from './homes';
import { organisations } from './organisations';

/**
 * M43, M44: photos and floor plans of a home or development, plus logos and agent photos.
 * Only processed copies are public (no location or camera details); the original upload is
 * deleted once it's processed.
 */
export const media = pgTable(
  'media',
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    homeId: uuid().references(() => homes.id, { onDelete: 'cascade' }),
    developmentId: uuid().references(() => developments.id, { onDelete: 'cascade' }),
    kind: text({ enum: mediaKinds }).notNull(),
    status: text({ enum: ['uploading', 'processing', 'ready', 'rejected'] })
      .notNull()
      .default('uploading'),
    contentType: text().notNull(),
    bytes: integer().notNull(),
    width: integer(),
    height: integer(),
    /** Widths written to the media bucket, largest last. */
    widths: integer().array(),
    /** M29: a 64-bit difference hash, to spot a photo taken from another listing. */
    phash: bigint({ mode: 'bigint' }),
    /** A colour shown while the photo loads, like "#a1b2c3". */
    placeholder: text(),
    /** M43: computer-generated images are labelled "CGI". */
    isCgi: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    altText: text(),
    rejectReason: text({ enum: ['not_an_image', 'too_small', 'unreadable', 'missing'] }),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('media_home_idx').on(t.homeId, t.position),
    index('media_development_idx').on(t.developmentId, t.position),
    index('media_phash_idx').on(t.phash),
    tenantPolicy(),
  ],
).enableRLS();
