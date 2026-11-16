'use client';

import { ArrowLeft, ArrowRight, ImagePlus, Trash2, TriangleAlert } from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { Menu, MenuItem } from './Menu';
import styles from './PhotoUploader.module.css';
import { shrinkPhoto } from './shrink-photo';

export interface UploadedPhoto {
  id: string;
  /** Where the browser loads it from. */
  href: string;
}

export type UploadResult = { ok: true; photo: UploadedPhoto } | { ok: false; message: string };

type Tile =
  | { key: string; state: 'done'; photo: UploadedPhoto }
  | { key: string; state: 'uploading'; file: File }
  | { key: string; state: 'failed'; file: File; message: string };

const done = (photo: UploadedPhoto): Tile => ({ key: photo.id, state: 'done', photo });

/** "Photo 2 of 5", and for the first, that it's the cover. */
function nameOf(position: number, total: number): string {
  return `Photo ${position + 1} of ${total}${position === 0 ? ', the cover' : ''}`;
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
 * The component keeps nothing itself: `upload`, `remove` and `reorder` do the work.
 */
export function PhotoUploader({
  photos,
  max,
  upload,
  remove,
  reorder,
  problem,
  onCount,
}: {
  photos: readonly UploadedPhoto[];
  /** The most photos there can be. */
  max: number;
  /** Sends one photo, in a form's `photo` field. */
  upload: (data: FormData) => Promise<UploadResult>;
  remove: (id: string) => Promise<void>;
  /** Every photo's ID, in the new order. */
  reorder: (ids: string[]) => Promise<void>;
  /** Something the person must put right here, in a sentence: shown under the button. */
  problem?: string;
  /** Told how many photos are kept, whenever that changes. */
  onCount?: (count: number) => void;
}) {
  const [tiles, setTiles] = useState<Tile[]>(() => photos.map(done));
  const [said, setSaid] = useState('');
  const [over, setOver] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const problemId = useId();

  const kept = tiles.filter((tile) => tile.state === 'done');
  const room = max - tiles.filter((tile) => tile.state !== 'failed').length;
  const count = kept.length;
  useEffect(() => {
    onCount?.(count);
    // Only the number matters: a new function each render mustn't call it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const replace = (key: string, next: Tile | null) =>
    setTiles((now) =>
      next
        ? now.map((tile) => (tile.key === key ? next : tile))
        : now.filter((tile) => tile.key !== key),
    );

  async function send(key: string, file: File) {
    const data = new FormData();
    data.set('photo', await shrinkPhoto(file));
    let result: UploadResult;
    try {
      result = await upload(data);
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
    const taken = files.filter((file) => file.type.startsWith('image/')).slice(0, room);
    if (taken.length === 0) return;
    const added = taken.map((file) => {
      made += 1;
      return { key: `new-${made}`, state: 'uploading' as const, file };
    });
    setTiles((now) => [...now, ...added]);
    setSaid(taken.length === 1 ? 'Uploading 1 photo.' : `Uploading ${taken.length} photos.`);
    for (const tile of added) await send(tile.key, tile.file);
  }

  async function retry(tile: Extract<Tile, { state: 'failed' }>) {
    replace(tile.key, { key: tile.key, state: 'uploading', file: tile.file });
    await send(tile.key, tile.file);
  }

  /** The kept photos take a new order; anything still uploading stays at the end. */
  async function putInOrder(ids: string[], what: string) {
    setTiles((now) => {
      const byId = new Map(now.map((tile) => [tile.key, tile]));
      const rest = now.filter((tile) => tile.state !== 'done');
      return [...ids.map((id) => byId.get(id)!).filter(Boolean), ...rest];
    });
    setSaid(what);
    await reorder(ids);
  }

  function move(id: string, by: -1 | 1) {
    const ids = kept.map((tile) => tile.key);
    const from = ids.indexOf(id);
    const to = from + by;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    void putInOrder(ids, `Photo moved to place ${to + 1} of ${ids.length}.`);
  }

  function dropOn(target: string) {
    if (!dragging || dragging === target) return;
    const ids = kept.map((tile) => tile.key).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(target), 0, dragging);
    void putInOrder(ids, `Photo moved to place ${ids.indexOf(dragging) + 1} of ${ids.length}.`);
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
          accept="image/jpeg,image/png,image/webp,image/*"
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
            const position = kept.indexOf(tile);
            const name = nameOf(position, kept.length);
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
                <img src={tile.photo.href} alt={name} className={styles.photo} draggable={false} />
                {position === 0 ? <span className={styles.cover}>Cover</span> : null}
                <span className={styles.more}>
                  <Menu label={name}>
                    {position > 0 ? (
                      <MenuItem icon={ArrowLeft} onSelect={() => move(tile.key, -1)}>
                        Move earlier
                      </MenuItem>
                    ) : null}
                    {position < kept.length - 1 ? (
                      <MenuItem icon={ArrowRight} onSelect={() => move(tile.key, 1)}>
                        Move later
                      </MenuItem>
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
