/**
 * Generates src/styles/tokens.css and src/styles/tokens.ts from docs/design-tokens.json.
 *   pnpm tokens         write the files
 *   pnpm tokens:check   fail if the committed files are out of date (used in CI)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadTokens, renderCss, renderTypeScript } from './tokens/lib';

const outputs = (() => {
  const tokens = loadTokens();
  return [
    { path: 'src/styles/tokens.css', content: renderCss(tokens) },
    { path: 'src/styles/tokens.ts', content: renderTypeScript(tokens) },
  ];
})();

if (process.argv.includes('--check')) {
  const stale = outputs.filter(
    ({ path, content }) => !existsSync(path) || readFileSync(path, 'utf8') !== content,
  );
  if (stale.length > 0) {
    console.error(
      `Design tokens are out of date: ${stale.map((o) => o.path).join(', ')}. Run \`pnpm tokens\`.`,
    );
    process.exit(1);
  }
  console.log('Design tokens are up to date.');
} else {
  for (const { path, content } of outputs) writeFileSync(path, content);
  console.log(`Wrote ${outputs.map((o) => o.path).join(' and ')}.`);
}
