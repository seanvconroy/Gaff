import type { MapFailure } from '@/domain/map/counts';
import type { DrawnShape } from '@/domain/map/draw';
import type { PinGroup } from '@/domain/map/points';
import { formatEuro } from '@/lib/format';

/**
 * The map's words (M38, M57, M117, M120, M128): for renters on the search map, and for letters
 * placing a home's pin. Plain and short, and each says what to do next.
 */

/** "€2,250": a pin's price. Whole euros: a pin has no room for cents. */
export function pinPrice(rentCents: number): string {
  return formatEuro(Math.round(rentCents / 100) * 100);
}

/** What a pin shows: the rent, or how many homes share its point. */
export function pinLabel(group: PinGroup): string {
  return group.homes.length === 1 ? pinPrice(group.fromRentCents) : `${group.homes.length} homes`;
}

/** What a pin is called: "€2,250 a month, 2 bed apartment in Ranelagh, Dublin 6". */
export function pinName(group: PinGroup): string {
  if (group.homes.length === 1) {
    return `${pinPrice(group.fromRentCents)} a month, ${group.homes[0]!.title}`;
  }
  return `${homesHere(group.homes.length)}, from ${pinPrice(group.fromRentCents)} a month`;
}

/** The heading of the list a shared pin opens: "3 homes here". */
export function homesHere(homes: number): string {
  return `${homes} homes here`;
}

export function clusterName(homes: number): string {
  return `${homes} homes here: zoom in`;
}

export const mapWords = {
  label: 'Map of the homes in this search',
  skip: 'Skip the map',
  draw: 'Draw',
  cancelDrawing: 'Cancel drawing',
  removeShape: 'Remove shape',
  done: 'Done',
  undo: 'Undo',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  homesOnTheMap: 'Homes on the map',
  close: 'Close',
  /** M137: the streets and areas drawn on the map come from Gaff's place index. */
  placesCredit: 'Places © OpenStreetMap',
  /** M131: screen readers hear the map arrive, since it loads after the list. */
  loading: 'Loading the map',
} as const;

/** M128: how to draw, by dragging or by tapping corners. */
export function drawingNote(corners: number): string {
  if (corners === 0) {
    return 'Draw round the area with your finger or mouse, or tap its corners and choose Done.';
  }
  if (corners < 3) {
    return `${corners} ${corners === 1 ? 'corner' : 'corners'} so far. Tap the next corner.`;
  }
  return `${corners} corners so far. Tap the next corner, or choose Done.`;
}

/** Why a drawn shape couldn't be searched, and what to do. */
export function shapeProblem(problem: Extract<DrawnShape, { ok: false }>['problem']): string {
  switch (problem) {
    case 'too_small':
      return 'Draw round the area you want, then let go.';
    case 'too_big':
      return 'That area is too big. Draw round a smaller one.';
    case 'outside':
      return 'Draw round an area in Ireland.';
  }
}

/** M120: one calm sentence whenever the map can't load, whatever the reason. */
export const MAP_UNAVAILABLE =
  'The map isn’t available right now. Every home is still in the list.';

/** M133: why the map failed, for Gaff's own staff. */
export const failureWords: Record<MapFailure, string> = {
  script: 'Google’s script didn’t arrive (a blocker, the network or the security policy)',
  auth: 'Google refused the key (the key, the allowed websites or billing)',
  google: 'Google drew its own error (the daily cap, or billing)',
  timeout: 'No map appeared in time',
};

/** M133: the email Gaff's admins get when a day's failures are worth a look. Numbers only. */
export function mapFailuresEmail(day: {
  opened: number;
  failed: number;
  byKind: Record<MapFailure, number>;
}): { subject: string; text: string } {
  const why = (Object.entries(day.byKind) as Array<[MapFailure, number]>)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `- ${count}: ${failureWords[kind]}`);
  return {
    subject: `The map couldn’t load ${day.failed} times yesterday`,
    text: [
      `Yesterday the search map was opened ${day.opened} times and couldn’t load ${day.failed} times. Renters saw the list, with a line saying the map wasn’t available.`,
      '',
      'Why:',
      ...why,
      '',
      'A blocker in a renter’s own browser shows as the script not arriving. Anything about the key, billing or the daily cap is ours to fix: the steps are in docs/deploy.md, under "The search map".',
      '',
      'The counts for the last month are at /staff/map.',
    ].join('\n'),
  };
}

/** M38: the letter's pin. */
export const pinWords = {
  heading: 'Where it is',
  intro:
    'Renters see the home on the map. Drag the pin to the front door, or tap the map where the home is.',
  introHidden:
    'Renters see the home on the map, within about 150 metres: you chose to show only the street and area.',
  keyboard:
    'With the pin selected, the arrow keys move it about 10 metres. Hold Shift to move it 50.',
  pin: 'The home’s pin',
  mapLabel: 'Map for placing the home’s pin',
  save: 'Save the location',
  saving: 'Saving…',
  saved: 'Saved. Renters see the home here on the map.',
  notPlaced: 'The pin isn’t placed yet.',
  moved: 'The pin has moved. Save the location to keep it.',
  unavailable:
    'The map isn’t available right now, so the pin can’t be placed. Try again in a few minutes. If your browser blocks Google’s map, allow it for Gaff and reload the page.',
  switchedOff:
    'Gaff’s map is switched off for now, so there’s no pin to place. Your home is still listed. We’ll ask you to place the pin when the map is back.',
} as const;

/** Where the pin starts, in words. */
export function pinStartWords(from: 'pin' | 'street' | 'area', streetName: string | null): string {
  if (from === 'street' && streetName) {
    return `The pin starts on ${streetName}, from the address. Move it to the home.`;
  }
  if (from === 'area') {
    return 'The pin starts in the middle of the area. Move it to the home.';
  }
  return '';
}

/** "The pin is on Highfield Road, in Rathgar.": where the pin is, for everyone and screen readers. */
export function pinWhere(where: { street: string | null; place: string | null }): string {
  // Some main streets carry their village's name: "on Ranelagh" says it all.
  if (where.street && where.place && where.street !== where.place) {
    return `The pin is on ${where.street}, in ${where.place}.`;
  }
  if (where.street) return `The pin is on ${where.street}.`;
  if (where.place) return `The pin is in ${where.place}.`;
  return 'The pin isn’t on a street or in an area Gaff knows.';
}

/** M126: a question, never a refusal: the letter knows where their home is. */
export function pinOutsideWords(addressArea: string, pinPlace: string | null): string {
  const where = pinPlace ? `This pin is in ${pinPlace}` : `This pin isn’t in ${addressArea}`;
  return pinPlace
    ? `${where}, but the address says ${addressArea}. Is that right? If it is, there’s nothing more to do. If not, move the pin and save it again.`
    : `${where}, where the address says the home is. Is that right? If it is, there’s nothing more to do. If not, move the pin and save it again.`;
}

/** A development's homes share its pin. */
export function developmentPinWords(name: string, others: number): string {
  if (others === 0)
    return `This home is in ${name}. Homes you add there later start with this pin.`;
  return `This home is in ${name}. Its ${others === 1 ? 'other home' : `other ${others} homes`} without a pin of their own will use this one.`;
}
