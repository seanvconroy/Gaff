'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mapWords, pinOutsideWords, pinStartWords, pinWords } from '@/copy/map';
import type { Point } from '@/domain/places/geo';
import type { FormState } from '@/lib/forms';
import type { MapSettings } from '@/lib/map';
import type { PinState } from '@/server/lettings/location';
import { MapErrorBoundary } from '@/ui/MapErrorBoundary';
import { Notice } from '@/ui/Notice';
import { PinPicker, type PinPickerWords } from '@/ui/PinPicker';
import styles from './flow.module.css';
import { StepForm, type StepFrame } from './StepForm';

type Action = (state: FormState, data: FormData) => Promise<FormState>;
type Described = { where: string; check: PinState['check']; pinPlace: string | null } | null;

/** Where the pin is, in words, a moment after it stops moving. */
const DESCRIBE_DELAY_MS = 400;

const pickerWords: PinPickerWords = {
  label: pinWords.mapLabel,
  pin: pinWords.pin,
  keyboard: pinWords.keyboard,
  movesLabel: pinWords.movesLabel,
  moves: pinWords.moves,
  zoomIn: mapWords.zoomIn,
  zoomOut: mapWords.zoomOut,
  standIn: mapWords.standIn,
};

/**
 * M38, M126: "Where is it on the map?", one question on one screen, after the address. The pin
 * starts on the address's street (or the area's middle); the lister drags it, taps the map, or
 * moves it a step with the buttons or the arrow keys, and the line under the map says where it
 * is. Next keeps it there. A pin outside the address's area is asked about, never refused. If
 * the map can't load (M120), the screen says so in Gaff's words and Next carries on without it.
 */
export function PinStep({
  frame,
  action,
  settings,
  pin,
  describe,
  primary,
}: {
  frame: StepFrame;
  action: Action;
  settings: MapSettings;
  pin: PinState;
  describe: (point: Point) => Promise<Described>;
  /** "Next" in the flow; "Save the pin" from Home. */
  primary: string;
}) {
  const [point, setPoint] = useState<Point>(pin.point);
  const [where, setWhere] = useState(pin.where);
  const [check, setCheck] = useState(pin.check);
  const [pinPlace, setPinPlace] = useState(pin.pinPlace);
  const [failed, setFailed] = useState(false);
  const describing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const asked = useRef(0);

  useEffect(() => () => clearTimeout(describing.current), []);

  const onMove = useCallback(
    (to: Point) => {
      setPoint(to);
      clearTimeout(describing.current);
      describing.current = setTimeout(async () => {
        const mine = ++asked.current;
        const words = await describe(to).catch(() => null);
        // Only the latest move's answer is worth saying.
        if (!words || mine !== asked.current) return;
        setWhere(words.where);
        setCheck(words.check);
        setPinPlace(words.pinPlace);
      }, DESCRIBE_DELAY_MS);
    },
    [describe],
  );
  const onFailed = useCallback(() => setFailed(true), []);

  const unavailable = (
    <Notice tone="warning" role="status">
      <p>{frame.step ? pinWords.unavailable : pinWords.unavailableAlone}</p>
    </Notice>
  );
  const start = pin.placed ? '' : pinStartWords(pin.from, pin.streetName);
  return (
    <StepForm
      id="pin"
      frame={frame}
      action={action}
      title={pinWords.title}
      lead={pin.approximate ? pinWords.leadApproximate : pinWords.lead}
      primary={primary}
    >
      {() => (
        <>
          <input type="hidden" name="lat" value={point.lat} />
          <input type="hidden" name="lng" value={point.lng} />
          {failed ? <input type="hidden" name="skip" value="1" /> : null}
          {/* The boundary stays while the map goes: anything Google's script throws on its way
              out ends in the same words, and the step carries on (M120). */}
          <MapErrorBoundary fallback={unavailable} onError={onFailed}>
            {failed ? (
              unavailable
            ) : (
              <>
                {start ? <p>{start}</p> : null}
                <PinPicker
                  settings={settings}
                  point={point}
                  close={pin.from === 'pin' || pin.from === 'street'}
                  streets={pin.streets}
                  words={pickerWords}
                  onMove={onMove}
                  onFailed={onFailed}
                />
                <p role="status" className={styles.pinWhere}>
                  {where}
                </p>
                {check === 'outside' ? (
                  <Notice tone="warning">
                    <p>{pinOutsideWords(pin.addressArea, pinPlace)}</p>
                  </Notice>
                ) : null}
              </>
            )}
          </MapErrorBoundary>
        </>
      )}
    </StepForm>
  );
}
