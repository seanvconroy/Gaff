'use client';

import {
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { Menu, MenuItem } from './Menu';
import styles from './PhotoUploader.module.css';
import { HOME_PHOTO_MAX_EDGE, shrinkPhoto } from './shrink-photo';

export interface UploadedPhoto {
  id: string;
  /** Where the browser loads it from. */
  href: string;
  /** M43: every size kept, for the browser to pick the one a tile needs. */
  srcSet?: string;
  /** M44: a floor plan comes after the photos and is never the cover. A photo unless said. */
  kind?: 'photo' | 'floor_plan';
}

export type UploadResult = { ok: true; photo: UploadedPhoto } | { ok: false; message: string };

/** M43: where to send one photo straight to the store, or why it can't go. */
export type StartedUpload =
  | {
      ok: true;
      uploadId: string;
      target: { url: string; method: 'PUT'; headers: Record<string, string> };
    }
  | { ok: false; message: string };

/**
 * M43: the photo goes straight to the store (Supabase): `start` gives a signed address, the
 * browser sends the photo there, and `finish` has Gaff read it back and clean it. Without this,
 * each photo goes through `upload`, on Gaff's own server.
 */
export interface DirectUpload {
  start: (file: { contentType: string; bytes: number }) => Promise<StartedUpload>;
  finish: (uploadId: string) => Promise<UploadResult>;
}

const isPlan = (photo: UploadedPhoto) => photo.kind === 'floor_plan';

/** An iPhone's own format, which some computers don't name as an image. */
const looksLikeHeic = (file: File) => /\.(heic|heif)$/i.test(file.name);

type Tile =
  | { key: string; state: 'done'; photo: UploadedPhoto }
  | { key: string; state: 'uploading'; file: File }
  | { key: string; state: 'failed'; file: File; message: string };

const done = (photo: UploadedPhoto): Tile => ({ key: photo.id, state: 'done', photo });

/** "Photo 2 of 5", and for the first, that it's the cover; "Floor plan 1 of 1" (M44). */
function nameOf(position: number, total: number, plan: boolean): string {
  if (plan) return `Floor plan ${position + 1} of ${total}`;
  return `Photo ${position + 1} of ${total}${position === 0 ? ', the cover' : ''}`;
}

/** Photos first, then floor plans, each in its own order (M44). */
function photosThenPlans(tiles: Tile[]): Tile[] {
  const plan = (tile: Tile) => tile.state === 'done' && isPlan(tile.photo);
  return [...tiles.filter((tile) => !plan(tile)), ...tiles.filter(plan)];
}

let made = 0;

/**
 * Photo uploader (section 8): adding and ordering a home's photos (UX-LT-10). Drag photos in,
 * or choose them: from files on a desktop, from the library or the camera on a phone. Each photo
 * is re-drawn in the browser first (no location or camera data, sized for display) and sent on
 * its own, so one that fails says so on its own tile, with "Try again", and the others carry on.
 *
 * The photos are a grid, two across on a phone and four on a desktop. The first is the cover.
 * They are put in order by dragging, and by "Move earlier" and "Move later" in each photo's
 * menu, so nothing depends on dragging (UX-DS-17). There is no line about rights (Q46).
 *
 * M44: a floor plan is added as a photo is, then marked "Floor plan" from its menu. It goes after
 * the photos, says so on its tile, and is never the cover.
 *
 * The component keeps nothing itself: `upload` (or `direct`), `remove`, `reorder` and `setKind`
 * do the work.
 */
export function PhotoUploader({
  photos,
  max,
  upload,
  direct,
  remove,
  reorder,
  setKind,
  problem,
  onCount,
}: {
  photos: readonly UploadedPhoto[];
  /** The most photos there can be. */
  max: number;
  /** Sends one photo, in a form's `photo` field. */
  upload: (data: FormData) => Promise<UploadResult>;
  /** M43: where the store can take a photo straight from the browser. */
  direct?: DirectUpload;
  remove: (id: string) => Promise<void>;
  /** Every photo's ID, in the new order. */
  reorder: (ids: string[]) => Promise<void>;
  /** M44: marks one as a floor plan, or as a photo again. Without it, there are no floor plans. */
  setKind?: (id: string, kind: 'photo' | 'floor_plan') => Promise<void>;
  /** Something the person must put right here, in a sentence: shown under the button. */
  problem?: string;
  /** Told how many photos are kept, whenever that changes. */
  onCount?: (count: number) => void;
}) {
  const [tiles, setTiles] = useState<Tile[]>(() => photosThenPlans(photos.map(done)));
  const [said, setSaid] = useState('');
  const [over, setOver] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const problemId = useId();

  const kept = tiles.filter((tile) => tile.state === 'done');
  const keptPhotos = kept.filter((tile) => !isPlan(tile.photo));
  const keptPlans = kept.filter((tile) => isPlan(tile.photo));
  const room = max - tiles.filter((tile) => tile.state !== 'failed').length;
  const count = kept.length;
  useEffect(() => {
    onCount?.(count);
    // Only the number matters: a new function each render mustn't call it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Whatever changes, floor plans stay after the photos and anything uploading.
  const replace = (key: string, next: Tile | null) =>
    setTiles((now) =>
      photosThenPlans(
        next
          ? now.map((tile) => (tile.key === key ? next : tile))
          : now.filter((tile) => tile.key !== key),
      ),
    );

  /** M43: straight to the store, then Gaff reads it back. */
  async function sendDirect(via: DirectUpload, photo: File): Promise<UploadResult> {
    const contentType = photo.type || (looksLikeHeic(photo) ? 'image/heic' : '');
    const started = await via.start({ contentType, bytes: photo.size });
    if (!started.ok) return started;
    const sent = await fetch(started.target.url, {
      method: started.target.method,
      headers: started.target.headers,
      body: photo,
    });
    if (!sent.ok) return { ok: false, message: 'That didn’t upload. Try it again.' };
    return via.finish(started.uploadId);
  }

  async function send(key: string, file: File) {
    const photo = await shrinkPhoto(file, HOME_PHOTO_MAX_EDGE);
    let result: UploadResult;
    try {
      if (direct) {
        result = await sendDirect(direct, photo);
      } else {
        const data = new FormData();
        data.set('photo', photo);
        result = await upload(data);
      }
    } catch {
      result = { ok: false, message: 'Check your connection and try again.' };
    }
    replace(
      key,
      result.ok ? done(result.photo) : { key, state: 'failed', file, message: result.message },
    );
    setSaid(result.ok ? 'Photo added.' : 'A photo didn’t upload.');
  }

  /** One after another, so a phone on a slow connection isn't sending thirty at once. */
  async function add(files: File[]) {
    const taken = files
      .filter((file) => file.type.startsWith('image/') || looksLikeHeic(file))
      .slice(0, room);
    if (taken.length === 0) return;
    const added = taken.map((file) => {
      made += 1;
      return { key: `new-${made}`, state: 'uploading' as const, file };
    });
    setTiles((now) => photosThenPlans([...now, ...added]));
    setSaid(taken.length === 1 ? 'Uploading 1 photo.' : `Uploading ${taken.length} photos.`);
    for (const tile of added) await send(tile.key, tile.file);
  }

  async function retry(tile: Extract<Tile, { state: 'failed' }>) {
    replace(tile.key, { key: tile.key, state: 'uploading', file: tile.file });
    await send(tile.key, tile.file);
  }

  /**
   * The kept photos take a new order, photos first and floor plans after them (the order is
   * always given that way); anything still uploading stays at the end.
   */
  async function putInOrder(ids: string[], what: string) {
    setTiles((now) => {
      const byId = new Map(now.map((tile) => [tile.key, tile]));
      const rest = now.filter((tile) => tile.state !== 'done');
      return [...ids.map((id) => byId.get(id)!).filter(Boolean), ...rest];
    });
    setSaid(what);
    await reorder(ids);
  }

  const isPlanId = (id: string) => keptPlans.some((tile) => tile.key === id);

  /** One place earlier or later, among the photos or among the floor plans. */
  function move(id: string, by: -1 | 1) {
    const plan = isPlanId(id);
    const group = (plan ? keptPlans : keptPhotos).map((tile) => tile.key);
    const from = group.indexOf(id);
    const to = from + by;
    if (from === -1 || to < 0 || to >= group.length) return;
    [group[from], group[to]] = [group[to]!, group[from]!];
    const ids = plan
      ? [...keptPhotos.map((tile) => tile.key), ...group]
      : [...group, ...keptPlans.map((tile) => tile.key)];
    const what = plan ? 'Floor plan' : 'Photo';
    void putInOrder(ids, `${what} moved to place ${to + 1} of ${group.length}.`);
  }

  function dropOn(target: string) {
    if (!dragging || dragging === target) return;
    const plan = isPlanId(dragging);
    // A floor plan can't be dragged among the photos, nor a photo among the floor plans.
    if (plan !== isPlanId(target)) return;
    const group = (plan ? keptPlans : keptPhotos)
      .map((tile) => tile.key)
      .filter((id) => id !== dragging);
    group.splice(group.indexOf(target), 0, dragging);
    const ids = plan
      ? [...keptPhotos.map((tile) => tile.key), ...group]
      : [...group, ...keptPlans.map((tile) => tile.key)];
    const what = plan ? 'Floor plan' : 'Photo';
    void putInOrder(
      ids,
      `${what} moved to place ${group.indexOf(dragging) + 1} of ${group.length}.`,
    );
  }

  /** M44: a floor plan goes after the photos; a photo marked again, to the end of the photos. */
  async function mark(id: string, kind: 'photo' | 'floor_plan') {
    if (!setKind) return;
    setTiles((now) =>
      photosThenPlans([
        ...now.filter((tile) => tile.key !== id),
        ...now
          .filter((tile) => tile.key === id)
          .map((tile) =>
            tile.state === 'done' ? { ...tile, photo: { ...tile.photo, kind } } : tile,
          ),
      ]),
    );
    setSaid(kind === 'floor_plan' ? 'Marked as a floor plan.' : 'Marked as a photo.');
    await setKind(id, kind);
  }

  async function take(id: string) {
    replace(id, null);
    setSaid('Photo removed.');
    await remove(id);
  }

  const filesIn = (event: DragEvent) => Array.from(event.dataTransfer?.files ?? []);

  return (
    <div className={styles.uploader}>
      <div
        className={`${styles.drop} ${over ? styles.over : ''}`}
        onDragOver={(event) => {
          if (dragging) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          if (dragging) return;
          event.preventDefault();
          setOver(false);
          void add(filesIn(event));
        }}
      >
        <ImagePlus className={styles.dropIcon} size={24} strokeWidth={1.75} aria-hidden="true" />
        <p id={hintId} className={styles.dropText}>
          {room > 0
            ? `Drag photos here, or choose them. Up to ${max}, and the first is the cover.`
            : `That’s ${max} photos, the most a home can have.`}
        </p>
        <Button
          variant="secondary"
          disabled={room <= 0}
          aria-describedby={problem ? `${problemId} ${hintId}` : hintId}
          onClick={() => input.current?.click()}
        >
          Choose photos
        </Button>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          aria-label="Choose photos"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void add(files);
          }}
        />
      </div>
      {problem ? (
        <p id={problemId} className={styles.problem}>
          <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
          <span>
            <span className="visually-hidden">Error: </span>
            {problem}
          </span>
        </p>
      ) : null}

      {tiles.length > 0 ? (
        <ul className={styles.grid} aria-label="Photos">
          {tiles.map((tile) => {
            if (tile.state === 'uploading') {
              return (
                <li key={tile.key} className={`${styles.tile} ${styles.waiting}`}>
                  <span className={styles.words}>Uploading…</span>
                </li>
              );
            }
            if (tile.state === 'failed') {
              return (
                <li key={tile.key} className={`${styles.tile} ${styles.failed}`}>
                  <span className={styles.words}>
                    <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
                    <strong>Didn’t upload</strong>
                    <span className={styles.reason}>{tile.message}</span>
                  </span>
                  <span className={styles.failedActions}>
                    <Button variant="secondary" onClick={() => void retry(tile)}>
                      Try again
                    </Button>
                    <Button variant="quiet" onClick={() => replace(tile.key, null)}>
                      Leave it out
                    </Button>
                  </span>
                </li>
              );
            }
            const plan = isPlan(tile.photo);
            const group = plan ? keptPlans : keptPhotos;
            const position = group.indexOf(tile);
            const name = nameOf(position, group.length, plan);
            return (
              <li
                key={tile.key}
                className={`${styles.tile} ${dragging === tile.key ? styles.lifted : ''}`}
                draggable
                onDragStart={(event) => {
                  setDragging(tile.key);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (dragging) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(tile.key);
                  setDragging(null);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.photo.href}
                  srcSet={tile.photo.srcSet}
                  sizes={tile.photo.srcSet ? '(min-width: 900px) 25vw, 50vw' : undefined}
                  alt={name}
                  className={`${styles.photo} ${plan ? styles.plan : ''}`}
                  draggable={false}
                />
                {plan ? (
                  <span className={styles.cover}>Floor plan</span>
                ) : position === 0 ? (
                  <span className={styles.cover}>Cover</span>
                ) : null}
                <span className={styles.more}>
                  <Menu label={name}>
                    {position > 0 ? (
                      <MenuItem icon={ArrowLeft} onSelect={() => move(tile.key, -1)}>
                        Move earlier
                      </MenuItem>
                    ) : null}
                    {position < group.length - 1 ? (
                      <MenuItem icon={ArrowRight} onSelect={() => move(tile.key, 1)}>
                        Move later
                      </MenuItem>
                    ) : null}
                    {setKind ? (
                      plan ? (
                        <MenuItem icon={ImageIcon} onSelect={() => void mark(tile.key, 'photo')}>
                          Mark as a photo
                        </MenuItem>
                      ) : (
                        <MenuItem
                          icon={LayoutGrid}
                          onSelect={() => void mark(tile.key, 'floor_plan')}
                        >
                          Mark as floor plan
                        </MenuItem>
                      )
                    ) : null}
                    <MenuItem icon={Trash2} destructive onSelect={() => void take(tile.key)}>
                      Remove
                    </MenuItem>
                  </Menu>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="visually-hidden" role="status">
        {said}
      </p>
    </div>
  );
}
