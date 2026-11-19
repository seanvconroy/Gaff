import type { PlaceOption } from '@/ui/PlaceSearch';

/**
 * M114, UX-SR-11: the places searched this visit, offered first under "Where" before anything is
 * typed. They stay in this browser tab's session storage, which the browser empties when the tab
 * closes, and are never sent anywhere: searching isn't recorded against anyone, signed in or not.
 */
const KEY = 'gaff-recent-places';
export const MAX_RECENT = 5;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const isOption = (value: unknown): value is PlaceOption => {
  const o = value as Partial<PlaceOption> | null;
  return (
    typeof o?.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.label === 'string' &&
    typeof o.description === 'string'
  );
};

export function recentPlaces(): PlaceOption[] {
  try {
    const kept = JSON.parse(storage()?.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(kept)
      ? kept.filter(isOption).map((o) => ({ ...o, icon: 'recent' as const }))
      : [];
  } catch {
    return [];
  }
}

/** Puts a picked place first, once, keeping the last five. */
export function rememberPlace(option: PlaceOption): void {
  const kept = [option, ...recentPlaces().filter((o) => o.id !== option.id)].slice(0, MAX_RECENT);
  try {
    storage()?.setItem(
      KEY,
      JSON.stringify(
        kept.map(({ id, name, label, description }) => ({ id, name, label, description })),
      ),
    );
  } catch {
    // Storage full or switched off: the place search works the same without it.
  }
}
