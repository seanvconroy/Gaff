/** Mailbox names an organisation can't take for its Gaff address (R5). */
const RESERVED = new Set([
  'postmaster',
  'abuse',
  'admin',
  'no-reply',
  'noreply',
  'reply',
  'support',
  'gaff',
]);

/** The local part of an organisation's Gaff address: "Halcyon Lettings" → "halcyon-lettings". */
export function inboundSlugFor(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  if (!slug) return 'operator';
  return RESERVED.has(slug) ? `${slug}-lettings` : slug;
}

/**
 * The Gaff address of a private landlord's silent organisation (UX-AC-4). It has no name to make
 * an address from, and a person's own name never goes in one: the address is in every reply-to,
 * and in the web address of their privacy notice (rule 8). So it is "home-" and eight random
 * letters and digits, from `random`: eight characters of a UUID will do.
 */
export function ownHomesSlug(random: string): string {
  const tail = random
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  if (tail.length < 8) throw new Error('ownHomesSlug needs eight random letters or digits');
  return `home-${tail}`;
}
