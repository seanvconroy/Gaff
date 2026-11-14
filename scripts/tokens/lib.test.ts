import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contrastMinimum,
  contrastRatio,
  definedCustomProperties,
  loadTokens,
  parseTokens,
  pxToRem,
  renderCss,
  renderTypeScript,
  resolveTokens,
  type ContrastRule,
  type Theme,
} from './lib';

const tokens = loadTokens();
const themes: Theme[] = ['light', 'dark'];
const surfaces = ['surface-0', 'surface-1', 'surface-2'];
const tints = ['success-bg', 'warning-bg', 'danger-bg', 'info-bg'];

/**
 * The pairs the design system promises (docs/design-system.md). The tokens file's contrast list
 * must include each, so a pair can't pass by being left out of the list.
 */
const promised: Array<[fg: string, bg: string, rule: ContrastRule]> = [
  // Text and secondary text, links, and status words on every surface.
  ...['ink', 'ink-muted', 'atlantic-text', 'success', 'warning', 'danger', 'info'].flatMap((fg) =>
    surfaces.map((bg) => [fg, bg, 'text'] as [string, string, ContrastRule]),
  ),
  // Control edges and the focus ring on every surface.
  ...['border-strong', 'focus'].flatMap((fg) =>
    surfaces.map((bg) => [fg, bg, 'ui'] as [string, string, ContrastRule]),
  ),
  // Buttons, and text on the accent fill (the current stage).
  ['ink-inverse', 'primary', 'text'],
  ['ink-inverse', 'primary-hover', 'text'],
  ['ink-inverse', 'danger', 'text'],
  ['ink-inverse', 'atlantic', 'text'],
  // Status pills and notices: the status colour and ink on its tint, and links in notices.
  ['success', 'success-bg', 'text'],
  ['warning', 'warning-bg', 'text'],
  ['danger', 'danger-bg', 'text'],
  ['info', 'info-bg', 'text'],
  ['ai', 'ai-bg', 'text'],
  ...tints.flatMap((bg) => [
    ['ink', bg, 'text'] as [string, string, ContrastRule],
    ['atlantic-text', bg, 'text'] as [string, string, ContrastRule],
    ['focus', bg, 'ui'] as [string, string, ContrastRule],
  ]),
  // Soft brand fill: text on it is ink.
  ['ink', 'sky', 'text'],
  // The navy sidebar and bottom bar.
  ['nav-ink', 'nav-bg', 'text'],
  ['nav-ink', 'nav-active', 'text'],
  ['nav-ink', 'navy', 'text'],
  ['nav-ink-muted', 'nav-bg', 'text'],
  ['nav-ink-muted', 'nav-active', 'text'],
  ['nav-focus', 'nav-bg', 'ui'],
  ['nav-focus', 'nav-active', 'ui'],
];

describe('design tokens (ADR-0011)', () => {
  it('the tokens file is valid and every reference resolves', () => {
    expect(Object.keys(tokens.colors)).toContain('surface-0');
    for (const [name, value] of Object.entries(tokens.colors)) {
      const solid = name === 'overlay' ? /^rgba\(/ : /^#[0-9a-f]{3,6}$/;
      expect(value.light).toMatch(solid);
      expect(value.dark).toMatch(solid);
    }
    expect(tokens.colors['focus']).toEqual(tokens.colors['atlantic-text']);
    expect(tokens.colors['ai']).toEqual(tokens.colors['info']);
    expect(tokens.colors['nav-bg']!.light).toBe(tokens.colors['navy']!.light);
  });

  it('the old brand names are gone, with no aliases left behind', () => {
    for (const old of ['forest', 'brick', 'brick-text', 'peach']) {
      expect(Object.keys(tokens.colors)).not.toContain(old);
    }
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

  it('rejects a contrast pair with an unknown or see-through colour', () => {
    const file = parseTokens(JSON.parse(readFileSync('docs/design-tokens.json', 'utf8')));
    const unknown = structuredClone(file);
    unknown.contrast.pairs[0]!.bg = 'nope';
    expect(() => resolveTokens(unknown)).toThrow(/unknown token "nope"/);
    const seeThrough = structuredClone(file);
    seeThrough.contrast.pairs[0]!.bg = 'overlay';
    expect(() => resolveTokens(seeThrough)).toThrow(/not a solid colour/);
  });

  it('the generated files are up to date with the tokens file', () => {
    expect(readFileSync('src/styles/tokens.css', 'utf8')).toBe(renderCss(tokens));
    expect(readFileSync('src/styles/tokens.ts', 'utf8')).toBe(renderTypeScript(tokens));
  });

  it('M129: a map keeps a scheme of its own, whatever the page’s theme', () => {
    const css = renderCss(tokens);
    for (const theme of ['light', 'dark'] as const) {
      const block = new RegExp(`\\[data-map-scheme="${theme}"\\] \\{([^}]*)\\}`).exec(css);
      expect(block, theme).not.toBeNull();
      expect(block![1]).toContain(`color-scheme: ${theme};`);
      for (const [name, value] of Object.entries(tokens.colors)) {
        expect(block![1]).toContain(`--color-${name}: ${value[theme]};`);
      }
    }
  });

  it('type sizes are in rem, so they follow the reader’s text size', () => {
    expect(pxToRem('16px')).toBe('1rem');
    expect(pxToRem('13px')).toBe('0.8125rem');
    const css = renderCss(tokens);
    expect(css).toContain('--type-body-size: 1rem;');
    expect(css).toContain('--type-display-mobile-size: 1.875rem;');
    expect(css).not.toMatch(/--type-[a-z0-9-]+-(size|line): \d+px/);
  });

  it('labels are uppercase through their type style', () => {
    expect(renderCss(tokens)).toMatch(
      /\.type-label \{[^}]*text-transform: var\(--type-label-transform\);/,
    );
    expect(renderCss(tokens)).toContain('--type-label-transform: uppercase;');
  });

  it('with reduced motion on, every duration is 0ms and nothing animates', () => {
    const css = renderCss(tokens);
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}/.exec(css);
    expect(reduced).not.toBeNull();
    const durations = Object.entries(tokens.motion).filter(([, value]) => /ms$/.test(value));
    expect(durations.map(([name]) => name)).toEqual(['motion-fast', 'motion-base', 'motion-slow']);
    for (const [name] of durations) expect(reduced![1]).toContain(`--${name}: 0ms;`);
  });

  it('the contrast list covers every pair the design system promises', () => {
    const listed = new Map(tokens.contrastPairs.map((p) => [`${p.fg}/${p.bg}`, p.rule]));
    const missing = promised
      .filter(([fg, bg, rule]) => {
        const listedRule = listed.get(`${fg}/${bg}`);
        return !listedRule || contrastMinimum[listedRule] < contrastMinimum[rule];
      })
      .map(([fg, bg, rule]) => `${fg}/${bg} (${rule})`);
    expect(missing).toEqual([]);
  });

  for (const pair of tokens.contrastPairs) {
    for (const theme of themes) {
      const key = `${theme}:${pair.fg}/${pair.bg}`;
      const minimum = contrastMinimum[pair.rule];
      it(`contrast ${key} meets WCAG AA for ${pair.rule} (${minimum}:1), as recorded`, () => {
        const ratio = contrastRatio(tokens.colors[pair.fg]![theme], tokens.colors[pair.bg]![theme]);
        expect(ratio).toBeGreaterThanOrEqual(minimum);
        // The design system's table shows these numbers; keep them true.
        expect(Math.round(ratio * 100) / 100).toBe(pair.recorded[theme]);
      });
    }
  }

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
