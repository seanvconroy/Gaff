/**
 * UX-AG-1, Q39: where the PSRA's register of licensed property services providers comes from.
 * The PSRA publishes it as a download and updates it weekly. Nothing is sent to the PSRA: this
 * only reads a public file. Adapters: a made-up sample (local and tests), and the published
 * download by its web address.
 */
export interface RegisterSource {
  /** Which adapter this is, for the record of each refresh. */
  name: 'sample' | 'url';
  /** The register's text, in the format `parseRegister` expects (src/domain/register/parse.ts). */
  read(): Promise<string>;
}
