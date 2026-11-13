import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMadeUpAddress } from '@/adapters/email/test-copy';
import { DUPLICATE_DISTANCE, MIN_PHOTOS_TO_PUBLISH, hammingDistance } from '@/domain/media/photos';
import { newLettingSchema } from '@/domain/lettings/new-letting';
import { irishToday } from '@/lib/format';
import { photoHash } from '@/server/media/process';
import { sceneSvg, seedPhoto, seedPhotoFile, seedPhotos } from './seed-photos';
import { seedLetters, shouldSeed } from './seed';

describe('Test copy seed: made-up letters and homes', () => {
  it('gives every made-up person a made-up address, so their mail stays in the outbox', () => {
    for (const letter of seedLetters) {
      expect(isMadeUpAddress(letter.email), letter.email).toBe(true);
      for (const home of letter.homes) {
        if (home.letting.landlordEmail) {
          expect(isMadeUpAddress(home.letting.landlordEmail)).toBe(true);
        }
      }
    }
  });

  it('lists at most four homes per letter, so a new account’s burst never holds them (M29)', () => {
    for (const letter of seedLetters) expect(letter.homes.length).toBeLessThanOrEqual(4);
  });

  it('describes each home in its own words, with lettings Gaff accepts', () => {
    const descriptions = seedLetters.flatMap((l) => l.homes.map((h) => h.description));
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const home of seedLetters.flatMap((l) => l.homes)) {
      const parsed = newLettingSchema().safeParse({
        addressLine2: '',
        availableFrom: irishToday(new Date(Date.now() + 21 * 86_400_000)),
        photosUrl: '',
        daftUrl: '',
        myhomeUrl: '',
        landlordName: '',
        landlordEmail: '',
        ...home.letting,
      });
      expect(parsed.success, home.letting.addressLine1).toBe(true);
    }
  });

  it('seeds only the test copy’s production deployment: never previews or production', () => {
    expect(shouldSeed({ GAFF_ENV: 'staging', VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true);
    expect(shouldSeed({ GAFF_ENV: 'staging', VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false);
    expect(shouldSeed({ GAFF_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' })).toBe(
      false,
    );
    expect(shouldSeed({ GAFF_ENV: 'staging' })).toBe(true);
    expect(shouldSeed({})).toBe(false);
  });

  it('gives every home at least 3 photos, each there and described for screen readers', () => {
    for (const letter of seedLetters) {
      for (const home of letter.homes) {
        expect(home.photos.length, home.letting.addressLine1).toBeGreaterThanOrEqual(
          MIN_PHOTOS_TO_PUBLISH,
        );
        for (const photo of home.photos) {
          expect(existsSync(seedPhotoFile(photo, letter.framing)), photo).toBe(true);
          expect(seedPhotos[photo].length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('never gives one letter a photo like another letter’s, so none looks copied (M29)', async () => {
    const hashes: Array<{ letter: number; photo: string; hash: bigint }> = [];
    for (const [letter, seeded] of seedLetters.entries()) {
      for (const photo of new Set(seeded.homes.flatMap((h) => h.photos))) {
        const hash = await photoHash(await seedPhoto(photo, seeded.framing));
        hashes.push({ letter, photo: `${photo}-${seeded.framing}`, hash });
      }
    }
    for (const a of hashes) {
      for (const b of hashes) {
        if (a.letter === b.letter) continue;
        expect(hammingDistance(a.hash, b.hash), `${a.photo} and ${b.photo}`).toBeGreaterThan(
          DUPLICATE_DISTANCE,
        );
      }
    }
  });

  it('draws the old pictures the same from the same seed, so the seed can swap them', () => {
    expect(sceneSvg('kitchen', 42)).toBe(sceneSvg('kitchen', 42));
    expect(sceneSvg('kitchen', 42)).not.toBe(sceneSvg('kitchen', 43));
  });
});
