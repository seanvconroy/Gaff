/** UX-SI-9: a session lasts 30 days from last use on that device. */
export const SESSION_LASTS_DAYS = 30;

/**
 * How often a session in use is given its full 30 days again. Once a day is enough: "last use"
 * is then never more than a day out, and an ordinary page doesn't write to the database.
 */
export const SESSION_RENEWED_EVERY_DAYS = 1;
