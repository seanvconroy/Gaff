import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { isMadeUpAddress } from '@/adapters/email/test-copy';
import { sampleRegisterCsv } from '@/adapters/register/sample-register';
import { criteriaSchema } from '@/domain/criteria/criteria';
import {
  DUPLICATE_DISTANCE,
  MIN_PHOTO_PIXELS,
  hammingDistance,
} from '@/domain/lettings/photo-files';
import { newLettingSchema } from '@/domain/lettings/new-letting';
import { addressArea, pinInArea } from '@/domain/map/pin';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { inIreland } from '@/domain/places/geo';
import { parseRegister } from '@/domain/register/parse';
import { irishToday } from '@/lib/format';
import { photoHash } from '@/server/lettings/photo-pipeline';
import { shouldSeed } from './seed';
import { seedListers } from './seed-homes';
import { seedPhoto, seedPhotoFile } from './seed-photos';

const homes = seedListers.flatMap((lister) => lister.homes);

describe('BA-4: the test copy’s made-up listers and homes', () => {
  it('BA-4: two agencies and a private landlord, with nine homes in Dublin, Galway and Cork', () => {
    expect(seedListers.map((lister) => lister.kind)).toEqual([
      'agency',
      'agency',
      'private_landlord',
    ]);
    expect(homes).toHaveLength(9);
    expect(new Set(homes.map((home) => home.letting.county))).toEqual(
      new Set(['Dublin', 'Galway', 'Cork']),
    );
  });

  it('BA-4: each agency is on the made-up sample register, licensed to let', () => {
    const { entries } = parseRegister(sampleRegisterCsv);
    for (const lister of seedListers.filter((l) => l.kind === 'agency')) {
      expect(
        entries.some((entry) => entry.licenceNumber === lister.licenceNumber),
        lister.licenceNumber,
      ).toBe(true);
    }
  });

  it('BA-4: every made-up person has a made-up address, so their mail stays in the outbox', () => {
    for (const lister of seedListers) {
      expect(isMadeUpAddress(lister.person.email), lister.person.email).toBe(true);
      for (const home of lister.homes) {
        if (home.letting.landlordEmail) {
          expect(isMadeUpAddress(home.letting.landlordEmail)).toBe(true);
        }
      }
    }
  });

  it('BA-4: every home is one Gaff accepts, its words pass the wording check (rule 3)', () => {
    const descriptions = homes.map((home) => home.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const home of homes) {
      const parsed = newLettingSchema().safeParse({
        addressLine2: '',
        availableFrom: irishToday(new Date(Date.now() + 21 * 86_400_000)),
        photosUrl: '',
        daftUrl: '',
        myhomeUrl: '',
        landlordName: '',
        landlordEmail: '',
        description: home.description,
        ...home.letting,
      });
      expect(parsed.error?.issues, home.letting.addressLine1).toBeUndefined();
      // A BER, so the home can be shown on gaff.ie (UX-LT-22).
      expect(home.letting.berRating, home.letting.addressLine1).toBeTruthy();
    }
  });

  it('BA-4: criteria come only from the fixed list (rule 3)', () => {
    for (const home of homes) {
      expect(criteriaSchema.safeParse(home.criteria).success, home.letting.addressLine1).toBe(true);
    }
  });

  it('M125, M126: every home has its own pin, in the area its address names', () => {
    const g = fixtureGazetteer();
    for (const home of homes) {
      const address = home.letting.addressLine1!;
      expect(inIreland(home.point), address).toBe(true);
      const area = addressArea(
        {
          addressLine1: address,
          addressLine2: null,
          area: home.letting.area!,
          county: home.letting.county!,
          eircode: home.letting.eircode ?? null,
        },
        g,
      );
      expect(area, address).not.toBeNull();
      expect(pinInArea(home.point, area!), `${address} in ${area!.name}`).toBe(true);
    }
    const points = homes.map((home) => `${home.point.lat},${home.point.lng}`);
    expect(new Set(points).size).toBe(points.length);
  });

  it('M43: every home has at least three photos, each there and big enough to show', async () => {
    for (const lister of seedListers) {
      for (const home of lister.homes) {
        expect(home.photos.length, home.letting.addressLine1).toBeGreaterThanOrEqual(3);
        for (const photo of home.photos) {
          expect(existsSync(seedPhotoFile(photo, lister.framing)), photo).toBe(true);
          const meta = await sharp(await seedPhoto(photo, lister.framing)).metadata();
          expect(Math.max(meta.width!, meta.height!)).toBeGreaterThanOrEqual(MIN_PHOTO_PIXELS);
        }
      }
    }
  });

  it('M29: no lister has a photo like another lister’s, so none looks taken from another', async () => {
    const hashes: Array<{ lister: number; photo: string; hash: bigint }> = [];
    for (const [index, lister] of seedListers.entries()) {
      for (const photo of new Set(lister.homes.flatMap((home) => home.photos))) {
        const hash = await photoHash(await seedPhoto(photo, lister.framing));
        hashes.push({ lister: index, photo: `${photo}-${lister.framing}`, hash });
      }
    }
    for (const a of hashes) {
      for (const b of hashes) {
        if (a.lister === b.lister) continue;
        expect(hammingDistance(a.hash, b.hash), `${a.photo} and ${b.photo}`).toBeGreaterThan(
          DUPLICATE_DISTANCE,
        );
      }
    }
  });

  it('BA-4: seeds only the test copy’s production deployment: never previews or production', () => {
    expect(shouldSeed({ GAFF_ENV: 'staging', VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true);
    expect(shouldSeed({ GAFF_ENV: 'staging', VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false);
    expect(shouldSeed({ GAFF_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' })).toBe(
      false,
    );
    // On Vercel, a deployment with no GAFF_ENV is production (withPlatformDefaults).
    expect(shouldSeed({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(false);
    expect(shouldSeed({ GAFF_ENV: 'staging' })).toBe(true);
    expect(shouldSeed({ GAFF_ENV: 'development' })).toBe(false);
    expect(shouldSeed({})).toBe(false);
  });
});
