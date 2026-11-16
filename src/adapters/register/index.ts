import { env } from '@/lib/env';
import type { RegisterSource } from '@/ports/register';
import { sampleRegisterCsv } from './sample-register';

/** A made-up register, for local work and tests. Production refuses it (src/lib/env.ts). */
export const sampleRegisterSource: RegisterSource = {
  name: 'sample',
  read: async () => sampleRegisterCsv,
};

/** The longest the PSRA's server is waited for. The job tries again if it takes longer. */
const DOWNLOAD_TIMEOUT_MS = 60_000;
/** The register is a few thousand short rows. Anything far bigger isn't it. */
const BIGGEST_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/**
 * The PSRA's published download, by its web address (PSRA_REGISTER_URL). It is a public file:
 * the request carries nothing about Gaff's users. A reply that isn't the file fails loudly, and
 * Gaff's copy stays as it was.
 */
export function urlRegisterSource(url: string): RegisterSource {
  return {
    name: 'url',
    read: async () => {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { accept: 'text/csv, text/plain;q=0.9, */*;q=0.1' },
      });
      if (!response.ok) {
        throw new Error(`The PSRA register couldn't be downloaded (HTTP ${response.status}).`);
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > BIGGEST_DOWNLOAD_BYTES) {
        throw new Error('The PSRA register download is far bigger than expected.');
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    },
  };
}

export function registerSource(): RegisterSource {
  const config = env();
  return config.PSRA_REGISTER_SOURCE === 'url'
    ? urlRegisterSource(config.PSRA_REGISTER_URL!)
    : sampleRegisterSource;
}
