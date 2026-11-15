/** Small pure rules behind the code input and the avatar, tested without a browser. */

/** The digits in what was typed or pasted, as plain 0 to 9, and never more than the code holds. */
export function codeDigits(value: string, length = 6): string {
  let digits = '';
  for (const character of value.normalize('NFKC')) {
    if (/\p{Nd}/u.test(character)) {
      // Any script's decimal digit: its value is its distance from that script's zero.
      const point = character.codePointAt(0)!;
      let zero = point;
      while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero -= 1;
      digits += String(point - zero);
    }
    if (digits.length === length) break;
  }
  return digits;
}

export function isCompleteCode(value: string, length = 6): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value);
}

/** "Ann Power" is "AP"; one word gives one letter. Never a photo: a profile has none (rule 3). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!][0]!;
  const last = words.length > 1 ? [...words.at(-1)!][0]! : '';
  return `${first}${last}`.toLocaleUpperCase('en-IE');
}
