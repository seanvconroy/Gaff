import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { isMadeUpAddress } from '@/adapters/email/test-copy';
import { DUPLICATE_DISTANCE, differenceHash, hammingDistance } from '@/domain/media/photos';
import { newLettingSchema } from '@/domain/lettings/new-letting';
import { irishToday } from '@/lib/format';
import { scenePhoto, sceneSvg } from './seed-photos';
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

  it('draws the same picture from the same seed', () => {
    expect(sceneSvg('kitchen', 42)).toBe(sceneSvg('kitchen', 42));
    expect(sceneSvg('kitchen', 42)).not.toBe(sceneSvg('kitchen', 43));
  });

  it('never draws one letter’s photos like another’s, so none looks copied (M29)', async () => {
    const scenes = ['outside', 'living', 'kitchen', 'bedroom'] as const;
    const hashes: Array<{ letter: number; hash: bigint }> = [];
    for (const [letter, seeded] of seedLetters.entries()) {
      for (const home of seeded.homes) {
        for (const [i, scene] of scenes.entries()) {
          const photo = await scenePhoto(scene, home.photoSeed * 100 + i);
          const thumb = await sharp(photo)
            .greyscale()
            .resize(9, 8, { fit: 'fill' })
            .raw()
            .toBuffer();
          hashes.push({ letter, hash: differenceHash(thumb) });
        }
      }
    }
    for (const a of hashes) {
      for (const b of hashes) {
        if (a.letter === b.letter) continue;
        expect(hammingDistance(a.hash, b.hash)).toBeGreaterThan(DUPLICATE_DISTANCE);
      }
    }
  }, 60_000);
});
