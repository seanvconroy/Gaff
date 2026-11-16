import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, personPolicy, updatedAt } from './columns';
import { organisations } from './organisations';
import { psraRegister } from './register';

/**
 * A person's own profile (UX-AC-1, UX-AC-5, ADR-0016): what Gaff keeps about a person as a
 * person, whatever they do on Gaff. It belongs to them and to no organisation: it has no
 * `organisation_id`, and its row-level security lets only the person's own path read it
 * (`withPerson`). No operator query can reach it.
 *
 * The person's name, email and sign-in methods stay in Better Auth's tables (`users`,
 * `accounts`, `passkeys`). What a renter keeps (WP-14) and a verified identity (WP-24) get their
 * own tables beside this one, with the same policy.
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: text()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UX-AC-2: when they said they're looking for a home. Null: "Renting" isn't one of theirs. */
    rentingSince: timestamp({ withTimezone: true }),
    /** UX-AC-11: the side they used last, `letting` or `renting`. Gaff reopens it. */
    lastSide: text({ enum: ['letting', 'renting'] }),
    /** UX-AC-11: the organisation they let for last, when they belong to more than one. */
    lastOrganisationId: uuid().references(() => organisations.id, { onDelete: 'set null' }),
    /**
     * UX-AC-10: where they are in first run, so they can leave and come back. `agency` once
     * they've said they work at one; the entry they picked, until they answer "Is this yours?".
     */
    firstRunPurpose: text({ enum: ['agency'] }),
    firstRunRegisterEntryId: uuid().references(() => psraRegister.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [personPolicy()],
).enableRLS();
