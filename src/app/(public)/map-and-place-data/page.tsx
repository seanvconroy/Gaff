import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../prose.module.css';

export const metadata: Metadata = {
  title: 'Map and place data',
  description: 'Where Gaff’s place suggestions and maps come from, and the credits they carry.',
  alternates: { canonical: '/map-and-place-data' },
};

/**
 * M56, M57 (ADR-0027): credits for the place index and the map. OpenStreetMap's licence (ODbL)
 * asks for its credit and an offer of the data Gaff built from it; Google's terms apply when its
 * map loads. The words are reviewed before launch (docs/launch-checklist.md).
 */
export default function MapAndPlaceDataPage() {
  return (
    <article className={styles.prose} aria-labelledby="data-heading">
      <h1 id="data-heading" className="type-display">
        Map and place data
      </h1>

      <h2 className="type-heading">Places you can search</h2>
      <p>
        When you type a town, an area, a street or a landmark, Gaff suggests places from its own
        index. Gaff built it from OpenStreetMap, the map anyone can edit:{' '}
        <a href="https://www.openstreetmap.org/copyright">
          © OpenStreetMap contributors, under the Open Database Licence
        </a>
        . Gaff adds the counties, Dublin’s postal districts and a few other names itself, and
        rebuilds the index every three months.
      </p>
      <p>
        Gaff’s index is open data too, under the same licence. If you’d like a copy, or the method
        Gaff uses to build it, <Link href="/contact">contact us</Link>.
      </p>
      <p>
        Nothing you type is sent to anyone else. If a place you typed can’t be found, Gaff counts
        the words, with no numbers and nothing about you, so it can add the place.
      </p>

      <h2 className="type-heading">The map</h2>
      <p>
        The map beside the homes is Google Maps. It loads only when it’s on your screen, and it
        shows only homes on Gaff. When it loads, your device contacts Google, and{' '}
        <a href="https://maps.google.com/help/terms_maps/">Google Maps’ terms</a> and{' '}
        <a href="https://policies.google.com/privacy">Google’s privacy policy</a> apply. The map
        carries its own credits in its corner.
      </p>

      <p>
        <Link href="/to-rent">Search homes to rent</Link>
      </p>
    </article>
  );
}
