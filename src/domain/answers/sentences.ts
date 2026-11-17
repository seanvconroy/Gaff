import type { DraftItem, Fact } from './guardrails';

/**
 * UX-AI-11: a drafted reply reads like a person wrote it. It answers the question in a sentence
 * ("Yes, it’s furnished."), never as a field and a value ("Furnishing: Furnished.").
 *
 * Nothing here adds to a fact. Each sentence says what its one fact says, in the fact's own
 * words, and the answer still cites that fact's ID. The guardrails check the sentence that goes
 * out, exactly as they check anything else the AI writes (rule 7).
 */

/** "Is it…?", "Does it…?", "Can I…?": a question that wants a yes or a no first. */
function asksYesOrNo(question: string): boolean {
  return /^(is|are|does|do|has|have|can|could|will|would|was|were|did)\b/i.test(question.trim());
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const ended = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
const count = (n: string, one: string, many: string) => `${n} ${n === '1' ? one : many}`;

/** "Furnishing: Furnished" → the label and the value. Null for a fact that isn't written so. */
function fieldAndValue(text: string): { label: string; value: string } | null {
  const match = /^([^:.?!\n]{1,60}): (.+)$/s.exec(text.trim());
  return match ? { label: match[1]!.trim(), value: match[2]!.trim() } : null;
}

/** The sentence for each of a home's own facts, by the fact's ID (`factsFor`). */
const sentences: Record<string, (value: string, yesOrNo: boolean) => string> = {
  'core:address': (value) => `The address is ${value}.`,
  'core:rent': (value) => `The rent is ${value}.`,
  'core:type-of-home': (value) =>
    value === 'Other'
      ? 'The type of home is other.'
      : `It’s ${/^[aeiou]/i.test(value) ? 'an' : 'a'} ${value.toLowerCase()}.`,
  'core:bedrooms': (value) =>
    /^\d+$/.test(value)
      ? `It has ${count(value, 'bedroom', 'bedrooms')}.`
      : `It’s a ${lowerFirst(value)}.`,
  'core:bathrooms': (value) => `It has ${count(value, 'bathroom', 'bathrooms')}.`,
  'core:furnishing': (value, yesOrNo) => {
    const said = `it’s ${value.toLowerCase()}.`;
    if (!yesOrNo || value === 'Part furnished') return upperFirst(said);
    return value === 'Unfurnished' ? `No, ${said}` : `Yes, ${said}`;
  },
  'core:ber-rating': (value) =>
    value === 'Exempt' ? 'It’s exempt from a BER rating.' : `The BER rating is ${value}.`,
  'core:parking': (value, yesOrNo) => {
    const said = `there’s ${lowerFirst(value)}.`;
    if (!yesOrNo) return upperFirst(said);
    return value === 'No parking' ? `No, ${said}` : `Yes, ${said}`;
  },
  // A web address ends the sentence with nothing after it, so it is still the address in the fact.
  'core:photos': (value) => `You can see the photos here: ${value}`,
};

/**
 * One fact, as the answer to one question. A fact the operator added as a question and an answer
 * gives its answer. A fact of the home's own gives its sentence. Anything else is said as it is
 * written, as a sentence.
 */
export function inASentence(question: string, fact: Fact): string {
  const text = fact.text.trim();
  const remembered = /^Asked: .*? Answer: (.+)$/s.exec(text);
  if (remembered) return ended(upperFirst(remembered[1]!.trim()));

  const available = /^Available from (.+)$/.exec(text);
  if (fact.id === 'core:available' && available) return `It’s available from ${available[1]}.`;

  const viewings = /^Viewing times[^:]*: (.+)$/s.exec(text);
  if (fact.id === 'core:viewings' && viewings) {
    return `The viewing times are ${viewings[1]}. You book a time once you’re invited.`;
  }

  const field = fieldAndValue(text);
  if (!field) return ended(upperFirst(text));

  const sentence = sentences[fact.id];
  if (sentence) return sentence(field.value, asksYesOrNo(question));
  if (fact.id.startsWith('core:criteria-')) {
    return `One of the things asked of everyone who wants to view: ${lowerFirst(field.value)}.`;
  }
  return `The ${lowerFirst(field.label)} is ${field.value}.`;
}

const plain = (text: string) => text.trim().replace(/\.$/, '').toLowerCase();

/** Whether an answer only repeats a fact as it is stored: a field and its value. */
export function repeatsTheFact(answer: string, fact: Fact): boolean {
  return fieldAndValue(fact.text) !== null && plain(answer) === plain(fact.text);
}

/**
 * UX-AI-11: an answer that came back as a fact's field and value is put as a sentence, from that
 * same fact. Every other answer is left exactly as it was written. The fact IDs never change.
 */
export function asASentence(item: DraftItem, facts: readonly Fact[]): DraftItem {
  if (!item.answer || item.factIds.length !== 1) return item;
  const fact = facts.find((f) => f.id === item.factIds[0]);
  if (!fact || !repeatsTheFact(item.answer, fact)) return item;
  return { ...item, answer: inASentence(item.question, fact) };
}
