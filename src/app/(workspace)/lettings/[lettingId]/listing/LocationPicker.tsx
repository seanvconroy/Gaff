'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { developmentPinWords, pinOutsideWords, pinStartWords, pinWords } from '@/copy/map';
import { NUDGE_METRES, nudge, type Direction } from '@/domain/map/pin';
import type { Point } from '@/domain/places/geo';
import type { MapSettings } from '@/lib/map';
import type { PinState } from '@/server/listings/location';
import { Button } from '@/ui/Button';
import { Stack } from '@/ui/Layout';
import { MapErrorBoundary } from '@/ui/map/MapErrorBoundary';
import { PinPicker } from '@/ui/map/PinPicker';
import { Notice } from '@/ui/Notice';
import { describePinAction, savePinAction } from './actions';
import styles from './listing.module.css';

/** Where the pin is, in words, a moment after it stops moving. */
const DESCRIBE_DELAY_MS = 400;

const moves: Array<{ direction: Direction; label: string; Icon: typeof ArrowUp }> = [
  { direction: 'north', label: 'Move the pin up', Icon: ArrowUp },
  { direction: 'south', label: 'Move the pin down', Icon: ArrowDown },
  { direction: 'west', label: 'Move the pin left', Icon: ArrowLeft },
  { direction: 'east', label: 'Move the pin right', Icon: ArrowRight },
];

/**
 * M38, M126: the letter places the home's pin. Drag it, tap the map, or move it a step at a
 * time with the buttons or the arrow keys; the line under the map says where it is. Saving it
 * never depends on the check: a pin outside the address's area is asked about, and kept.
 */
export function LocationPicker({
  lettingId,
  settings,
  pin: initial,
  hidden,
}: {
  lettingId: string;
  settings: MapSettings;
  pin: PinState;
  /** The letter shows renters only the street and area, so the point they see is approximate. */
  hidden: boolean;
}) {
  const [pin, setPin] = useState(initial);
  const [point, setPoint] = useState<Point>(initial.point);
  const [where, setWhere] = useState(initial.where);
  const [moved, setMoved] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, startSaving] = useTransition();
  const describing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const asked = useRef(0);

  useEffect(() => () => clearTimeout(describing.current), []);

  const onMove = useCallback(
    (to: Point) => {
      setPoint(to);
      setMoved(true);
      setJustSaved(false);
      setProblem(null);
      clearTimeout(describing.current);
      describing.current = setTimeout(async () => {
        const mine = ++asked.current;
        const words = await describePinAction(lettingId, to);
        // Only the latest move's answer is worth saying.
        if (words && mine === asked.current) setWhere(words);
      }, DESCRIBE_DELAY_MS);
    },
    [lettingId],
  );
  const onFailed = useCallback(() => setFailed(true), []);

  const save = () =>
    startSaving(async () => {
      const saved = await savePinAction(lettingId, point);
      if (!saved.ok) {
        setProblem(saved.error);
        return;
      }
      // The streets around the pin were sent once, for the stand-in map: keep them.
      setPin({ ...saved.pin, streets: pin.streets });
      setWhere(saved.pin.where);
      setMoved(false);
      setJustSaved(true);
    });

  const unavailable = (
    <Notice tone="warning" role="status">
      <p>{pinWords.unavailable}</p>
    </Notice>
  );
  const start = pin.placed ? '' : pinStartWords(pin.from, pin.streetName);
  // The boundary stays while the map goes: anything Google's script throws on its way out
  // ends in the same words, and the rest of the listing carries on (M120).
  return (
    <MapErrorBoundary fallback={unavailable} onError={onFailed}>
      {failed ? (
        unavailable
      ) : (
        <Stack gap={4}>
          <p>{hidden ? pinWords.introHidden : pinWords.intro}</p>
          {start ? <p>{start}</p> : null}
          {pin.development ? (
            <p>{developmentPinWords(pin.development.name, pin.development.others)}</p>
          ) : null}
          <PinPicker
            settings={settings}
            point={point}
            close={pin.from !== 'area'}
            streets={pin.streets}
            label={pinWords.mapLabel}
            pinLabel={pinWords.pin}
            describedBy="pin-keys"
            onMove={onMove}
            onFailed={onFailed}
          />
          <p role="status" className={styles.pinWhere}>
            {where}
          </p>
          <div className={styles.pinMoves} role="group" aria-label="Move the pin a step">
            {moves.map(({ direction, label, Icon }) => (
              <button
                key={direction}
                type="button"
                className={styles.pinMove}
                aria-label={label}
                onClick={() => onMove(nudge(point, direction, NUDGE_METRES))}
              >
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            ))}
            <p id="pin-keys" className={styles.pinHint}>
              {pinWords.keyboard}
            </p>
          </div>
          {problem ? (
            <Notice tone="danger" role="alert">
              <p>{problem}</p>
            </Notice>
          ) : null}
          {!moved && pin.placed && pin.check === 'outside' ? (
            <Notice tone="warning" role="status">
              <p>{pinOutsideWords(pin.addressArea, pin.pinPlace)}</p>
            </Notice>
          ) : null}
          <div className={styles.pinSave}>
            <Button onClick={save} disabled={saving}>
              {saving ? pinWords.saving : pinWords.save}
            </Button>
            <p role="status" className={styles.saved}>
              {justSaved
                ? pinWords.saved
                : moved
                  ? pinWords.moved
                  : pin.placed
                    ? ''
                    : pinWords.notPlaced}
            </p>
          </div>
        </Stack>
      )}
    </MapErrorBoundary>
  );
}
