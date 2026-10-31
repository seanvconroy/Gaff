import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  definedCustomProperties,
  loadTokens,
  parseTokens,
  renderCss,
  renderTypeScript,
  resolveTokens,
  type Theme,
} from './lib';

const tokens = loadTokens();
const themes: Theme[] = ['light', 'dark'];
const surfaces = ['surface-0', 'surface-1', 'surface-2'];

// The pairs the design system promises (docs/design-system.md, docs/design-tokens.json usage notes).
const textPairs = [
  ...['ink', 'ink-muted', 'brick-text', 'success', 'warning', 'danger', 'info'].flatMap((fg) =>
    surfaces.map((bg) => [fg, bg] as const),
  ),
  ['ink-inverse', 'primary'],
  ['ink-inverse', 'forest'],
  ['peach', 'forest'],
] as const;
const nonTextPairs = [
  ...['border-strong', 'focus', 'brick', 'primary'].flatMap((fg) =>
    surfaces.map((bg) => [fg, bg] as const),
  ),
] as const;

/**
 * Known problems in design-tokens.json v1, tracked in docs/status.md. In the dark theme,
 * forest is too light for text on it. Until the tokens are fixed, no component puts text
 * on forest. When the tokens are fixed, this test fails and asks for the entry to go.
 */
const knownTokenIssues = new Set(['dark:ink-inverse/forest', 'dark:peach/forest']);

describe('design tokens (ADR-0011)', () => {
  it('the tokens file is valid and every reference resolves', () => {
    expect(Object.keys(tokens.colors)).toContain('surface-0');
    for (const value of Object.values(tokens.colors)) {
      expect(value.light).toMatch(/^#[0-9a-f]{3,6}$/);
      expect(value.dark).toMatch(/^#[0-9a-f]{3,6}$/);
    }
    expect(tokens.colors['focus']).toEqual(tokens.colors['brick']);
  });

  it('rejects an invalid tokens file with a readable reason', () => {
    expect(() => parseTokens({ name: 'x' })).toThrow(/design-tokens.json is not valid/);
  });

  it('rejects references to unknown tokens and reference loops', () => {
    const file = parseTokens(JSON.parse(readFileSync('docs/design-tokens.json', 'utf8')));
    const unknown = structuredClone(file);
    unknown.color.tokens[0]!.value.light = '{nope}';
    expect(() => resolveTokens(unknown)).toThrow(/unknown token "nope"/);
    const loop = structuredClone(file);
    loop.color.tokens[0]!.value.dark = `{${loop.color.tokens[1]!.name}}`;
    loop.color.tokens[1]!.value.dark = `{${loop.color.tokens[0]!.name}}`;
    expect(() => resolveTokens(loop)).toThrow(/loop/);
  });

  it('the generated files are up to date with the tokens file', () => {
    expect(readFileSync('src/styles/tokens.css', 'utf8')).toBe(renderCss(tokens));
    expect(readFileSync('src/styles/tokens.ts', 'utf8')).toBe(renderTypeScript(tokens));
  });

  for (const theme of themes) {
    for (const [fg, bg] of textPairs) {
      const key = `${theme}:${fg}/${bg}`;
      if (knownTokenIssues.has(key)) continue;
      it(`text contrast ${key} meets WCAG AA (4.5:1)`, () => {
        expect(
          contrastRatio(tokens.colors[fg]![theme], tokens.colors[bg]![theme]),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [fg, bg] of nonTextPairs) {
      it(`non-text contrast ${theme}:${fg}/${bg} meets WCAG AA (3:1)`, () => {
        expect(
          contrastRatio(tokens.colors[fg]![theme], tokens.colors[bg]![theme]),
        ).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('the known token issues are still issues (remove them once the tokens are fixed)', () => {
    for (const key of knownTokenIssues) {
      const [theme, pair] = key.split(':') as [Theme, string];
      const [fg, bg] = pair.split('/') as [string, string];
      expect(contrastRatio(tokens.colors[fg]![theme], tokens.colors[bg]![theme])).toBeLessThan(4.5);
    }
  });

  it('every var(--…) used in the app stylesheets is defined by the tokens', () => {
    const defined = definedCustomProperties(tokens);
    const cssFiles = walk('src').filter(
      (file) => file.endsWith('.css') && !file.endsWith('tokens.css'),
    );
    const missing: string[] = [];
    for (const file of cssFiles) {
      for (const match of readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(match[1]!)) missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
