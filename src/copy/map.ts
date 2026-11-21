import type { MapFailure } from '@/domain/map/counts';
import type { PinGroup } from '@/domain/map/points';
import { formatEuro } from '@/lib/format';

/**
 * The map's words (M38, M57, M117, M120, M126): for renters on the search map, and for listers
 * placing a home's pin. Plain and short, and each says what happens next.
 */

/** "€2,250": a pin's price. Whole euros: a pin has no room for cents. */
export function pinPrice(rentCents: number): string {
  return formatEuro(Math.round(rentCents / 100) * 100);
}

/** What a pin shows: the rent, or how many homes share its point. */
export function pinLabel(group: PinGroup): string {
  return group.homes.length === 1 ? pinPrice(group.fromRentCents) : `${group.homes.length} homes`;
}

/** What a pin is called: "€2,250 a month, 2-bed apartment · Ranelagh, Dublin 6". */
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

/** M57: how many of the homes in the list are on the map: some have no pin yet. */
export function onTheMap(pinned: number, listed: number): string {
  if (listed === 0) return 'No homes to show on the map.';
  if (pinned === listed) return listed === 1 ? '1 home on the map.' : `${listed} homes on the map.`;
  return `${pinned} of ${listed} homes on the map. The others are in the list.`;
}

export const mapWords = {
  label: 'Map of the homes in this search',
  /** M57: below 900px, one control between the list and the map. */
  showMap: 'Map',
  showList: 'List',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  close: 'Close',
  /**
   * UX-SR-13: drawing an area to search. One short word on each control; the hint says how.
   */
  draw: 'Draw',
  /** With an area drawn already, the same button draws one more. */
  drawAnother: 'Draw another area',
  edit: 'Edit',
  done: 'Done',
  clear: 'Clear',
  remove: 'Remove this area',
  cancel: 'Cancel',
  finish: 'Finish',
  drawHint: 'Draw round the area you want, or tap its corners.',
  drawTooSmall: 'That was too small to search. Draw a bigger loop.',
  editHint: 'Drag a corner to reshape it. Drag a small dot to add a corner.',
  /** What a screen reader hears of the drawing surface, and the keyboard's way in. */
  drawSurface:
    'Drawing an area. Trace a loop with a finger or the mouse, or tap each corner. Press Enter for a square you can reshape, or Escape to cancel.',
  shape: (n: number, of: number) => (of === 1 ? 'Drawn area' : `Drawn area ${n} of ${of}`),
  corner: (n: number, of: number) =>
    `Corner ${n} of ${of}. The arrow keys move it; Delete removes it.`,
  addCorner: 'Add a corner here',
  /** M137: the streets and areas drawn on the map come from Gaff's place index. */
  placesCredit: 'Places © OpenStreetMap',
  /** M131: screen readers hear the map arrive, since it loads after the list. */
  loading: 'Loading the map',
  /** The stand-in's own credit, in place of Google's: it is never the real map. */
  standIn: 'Test map: not Google Maps',
  chosen: (title: string) => `Chosen home: ${title}`,
} as const;

/** M120: one calm sentence whenever the map can't load, whatever the reason. */
export const MAP_UNAVAILABLE =
  'The map isn’t available right now. Every home is still in the list.';

/** M133: why the map failed, for Gaff's own team. */
export const failureWords: Record<MapFailure, string> = {
  script: 'Google’s script didn’t arrive (a blocker, the network or the security policy)',
  auth: 'Google refused the key (the key, the allowed websites or billing)',
  google: 'Google drew its own error (the daily cap, or billing)',
  timeout: 'No map appeared in time',
  error: 'The map’s code hit an error (a change in Google’s script, or a bug in Gaff’s)',
};

/** M38: the lister's pin, on "Where is it on the map?" and from Home. */
export const pinWords = {
  title: 'Where is it on the map?',
  lead: 'Renters see the home here on the map. Move the pin to the front door if it isn’t there.',
  leadApproximate:
    'Renters see the home within about 150 metres of the pin, not at its door. Move the pin to the home if it isn’t there.',
  keyboard:
    'With the pin selected, the arrow keys move it about 10 metres. Hold Shift to move it 50.',
  pin: 'The home’s pin',
  mapLabel: 'Map for placing the home’s pin',
  movesLabel: 'Move the pin a step',
  moves: {
    north: 'Move the pin up',
    south: 'Move the pin down',
    west: 'Move the pin left',
    east: 'Move the pin right',
  },
  /** The step's one primary button. */
  next: 'Next',
  save: 'Save the pin',
  saved: 'Saved. Renters see the home here on the map.',
  /** Home, on the letting's page. */
  heading: 'Where it is',
  placed: 'The pin is placed. Renters see the home there on the map.',
  notPlaced: 'The pin isn’t placed yet, so the home is in the list but not on the map.',
  place: 'Place the pin',
  move: 'Move the pin',
  problem: 'Place the pin on the home, in Ireland.',
  closed: 'This letting is closed. Let the home again to move its pin.',
  unavailable:
    'The map isn’t available right now, so the pin can’t be placed. Choose Next to carry on: the home goes in the list, and you can place the pin from its page later.',
  unavailableAlone:
    'The map isn’t available right now, so the pin can’t be moved. Try again in a few minutes.',
  switchedOff:
    'Gaff’s map is switched off for now, so there’s no pin to place. The home is in the list. You can place the pin from its page when the map is back.',
} as const;

/** Where the pin starts, in words. */
export function pinStartWords(
  from: 'pin' | 'street' | 'area' | 'county',
  streetName: string | null,
): string {
  if (from === 'street' && streetName) {
    return `The pin starts on ${streetName}, from the address. Move it to the home.`;
  }
  if (from === 'area') return 'The pin starts in the middle of the area. Move it to the home.';
  if (from === 'county') return 'The pin starts in the middle of the county. Move it to the home.';
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

/** M126: a question, never a refusal: the lister knows where their home is. */
export function pinOutsideWords(addressArea: string, pinPlace: string | null): string {
  return pinPlace
    ? `This pin is in ${pinPlace}, but the address says ${addressArea}. If that’s right, there’s nothing more to do. If not, move the pin.`
    : `This pin isn’t in ${addressArea}, where the address says the home is. If that’s right, there’s nothing more to do. If not, move the pin.`;
}
