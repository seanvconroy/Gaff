import { describe, expect, it } from 'vitest';
import {
  MAX_HOME_PHOTOS,
  coverOf,
  movedPhoto,
  isPhotoKey,
  photoFolder,
  photoKey,
  photoRoomLeft,
  previewPhotoKey,
  reorderedPhotos,
  sizedPhotoKey,
  storedPhotoKeys,
  uploadKey,
} from './photos';

const order = ['a', 'b', 'c'];

describe('UX-LT-10: a home’s photos', () => {
  it('UX-LT-10: the first photo is the cover', () => {
    expect(coverOf(order)).toBe('a');
    expect(coverOf([])).toBeNull();
  });

  it('UX-LT-10: "Move earlier" and "Move later" swap a photo with its neighbour', () => {
    expect(movedPhoto(order, 'b', 'earlier')).toEqual(['b', 'a', 'c']);
    expect(movedPhoto(order, 'b', 'later')).toEqual(['a', 'c', 'b']);
  });

  it('UX-LT-10: a photo at the end stays where it is, and an unknown one changes nothing', () => {
    expect(movedPhoto(order, 'a', 'earlier')).toEqual(order);
    expect(movedPhoto(order, 'c', 'later')).toEqual(order);
    expect(movedPhoto(order, 'z', 'later')).toEqual(order);
  });

  it('UX-LT-10: dragging sends a new order of the same photos', () => {
    expect(reorderedPhotos(order, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('UX-LT-10: reordering can’t add, drop or double a photo', () => {
    expect(reorderedPhotos(order, ['c', 'a'])).toBeNull();
    expect(reorderedPhotos(order, ['c', 'a', 'a'])).toBeNull();
    expect(reorderedPhotos(order, ['c', 'a', 'z'])).toBeNull();
    expect(reorderedPhotos(order, ['c', 'a', 'b', 'z'])).toBeNull();
  });

  it('UX-LT-10: a home takes up to 30 photos', () => {
    expect(MAX_HOME_PHOTOS).toBe(30);
    expect(photoRoomLeft(0)).toBe(30);
    expect(photoRoomLeft(28)).toBe(2);
    expect(photoRoomLeft(30)).toBe(0);
    expect(photoRoomLeft(31)).toBe(0);
  });

  it('rule 8: where a photo is kept names no home and no person', () => {
    const key = photoKey(
      '0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11',
      '7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e',
      'image/jpeg',
    );
    expect(key).toBe(
      'homes/0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11/7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e.jpg',
    );
    expect(photoKey('o', 'p', 'image/webp')).toBe('homes/o/p.webp');
  });

  it('UX-LT-10: only a key a photo could have is ever looked up', () => {
    const key = photoKey(
      '0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11',
      '7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e',
      'image/png',
    );
    expect(isPhotoKey(key)).toBe(true);
    for (const other of [
      'homes/o/p.webp',
      `${key}/more`,
      key.replace('homes/', 'documents/'),
      key.replace('.png', '.svg'),
      `../${key}`,
      '',
    ]) {
      expect(isPhotoKey(other)).toBe(false);
    }
  });

  it('M43: each photo keeps its sizes in a folder of its own, named by IDs alone', () => {
    const org = '0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11';
    const folder = photoFolder(org, '7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e');
    expect(folder).toBe(`homes/${org}/7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e`);
    expect(sizedPhotoKey(folder, 960)).toBe(`${folder}/960.webp`);
    expect(storedPhotoKeys({ storageKey: folder, widths: [480, 960] })).toEqual([
      `${folder}/480.webp`,
      `${folder}/960.webp`,
      `${folder}/preview.jpg`,
    ]);
    // A photo kept before the pipeline is one file.
    expect(storedPhotoKeys({ storageKey: `${folder}.png`, widths: [] })).toEqual([`${folder}.png`]);
    for (const key of [
      sizedPhotoKey(folder, 480),
      sizedPhotoKey(folder, 2048),
      previewPhotoKey(folder),
    ]) {
      expect(isPhotoKey(key)).toBe(true);
    }
    // An upload waiting to be read is never served.
    for (const key of [
      folder,
      sizedPhotoKey(folder, 500),
      `${folder}/original`,
      `${folder}/960.png`,
      uploadKey(org, '7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e'),
    ]) {
      expect(isPhotoKey(key)).toBe(false);
    }
  });
});
