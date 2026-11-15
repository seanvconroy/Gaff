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
type Pair = [fg: string, bg: string, rule: ContrastRule];

/**
 * The pairs the design system promises (docs/design-system.md, UX-DS-5). The tokens file's
 * contrast list must include each, so a pair can't pass by being left out of the list.
 */
const promised: Pair[] = [
  // Text and secondary text, links, and status words on every surface.
  ...['ink', 'ink-muted', 'brand-text', 'success', 'warning', 'danger', 'info'].flatMap((fg) =>
    surfaces.map((bg): Pair => [fg, bg, 'text']),
  ),
  // The brand tint behind a selected choice and the AI label.
  ...['ink', 'ink-muted', 'brand-text'].map((fg): Pair => [fg, 'brand-bg', 'text']),
  ['ai', 'ai-bg', 'text'],
  // Control edges, the accent and the main button as fills or edges, and the focus ring.
  ...['border-strong', 'brand', 'primary', 'focus'].flatMap((fg) =>
    surfaces.map((bg): Pair => [fg, bg, 'ui']),
  ),
  ['brand', 'brand-bg', 'ui'],
  ['focus', 'brand-bg', 'ui'],
  // Buttons, and text on the accent fill (the current step).
  ['ink-inverse', 'primary', 'text'],
  ['ink-inverse', 'primary-hover', 'text'],
  ['ink-inverse', 'danger', 'text'],
  ['ink-inverse', 'danger-hover', 'text'],
  ['ink-inverse', 'brand', 'text'],
  // Status pills and notices: the status colour and ink on its tint, and links in notices.
  ['success', 'success-bg', 'text'],
  ['warning', 'warning-bg', 'text'],
  ['danger', 'danger-bg', 'text'],
  ['info', 'info-bg', 'text'],
  ...tints.flatMap((bg): Pair[] => [
    ['ink', bg, 'text'],
    ['ink-muted', bg, 'text'],
    ['brand-text', bg, 'text'],
    ['focus', bg, 'ui'],
  ]),
];

describe('design tokens (ADR-0011)', () => {
  it('the tokens file is valid and every reference resolves', () => {
    expect(Object.keys(tokens.colors)).toContain('surface-0');
    for (const [name, value] of Object.entries(tokens.colors)) {
      const solid = name === 'overlay' ? /^rgba\(/ : /^#[0-9a-f]{3,6}$/;
      expect(value.light).toMatch(solid);
      expect(value.dark).toMatch(solid);
    }
    expect(tokens.colors['focus']).toEqual(tokens.colors['brand-text']);
  });

  it('UX-DS-1: the page and its cards are white, and fills use one neutral', () => {
    expect(tokens.colors['surface-0']!.light).toBe('#ffffff');
    expect(tokens.colors['surface-1']!.light).toBe('#ffffff');
    expect(tokens.colors['surface-2']!.light).not.toBe('#ffffff');
    expect(Object.keys(tokens.colors).filter((name) => name.startsWith('surface-'))).toEqual(
      surfaces,
    );
  });

  it('UX-DS-2: the primary button is ink', () => {
    expect(tokens.colors['primary']).toEqual(tokens.colors['ink']);
  });

  it('UX-DS-4: tokens are named by role, with no hue names or aliases left behind', () => {
    const names = Object.keys(tokens.colors);
    for (const old of ['forest', 'brick', 'brick-text', 'peach', 'navy', 'atlantic', 'sky']) {
      expect(names).not.toContain(old);
    }
    expect(names.filter((name) => /^(nav|atlantic)-/.test(name))).toEqual([]);
    for (const role of ['brand', 'brand-text', 'brand-bg']) expect(names).toContain(role);
  });

  it('UX-DS-6: the accent is one value: links, focus and the assistant’s colour follow it', () => {
    for (const follower of ['brand-text', 'focus', 'ai']) {
      expect(tokens.colors[follower]).toEqual(tokens.colors['brand']);
    }
    expect(tokens.colors['ai-bg']).toEqual(tokens.colors['brand-bg']);
  });

  it('UX-DS-7: one type family, DM Sans, for every style', () => {
    expect(Object.keys(tokens.families)).toEqual(['sans']);
    expect(tokens.families['sans']).toMatch(/^'DM Sans'/);
    expect(tokens.typeStyles.map((style) => style.name)).toEqual([
      'display',
      'display-mobile',
      'title',
      'heading',
      'body',
      'body-sm',
      'label',
      'caption',
    ]);
    for (const style of tokens.typeStyles) expect(style.family).toBe('sans');
    expect(renderCss(tokens)).not.toMatch(/Fraunces|Georgia|[^-]serif/);
  });

  it('UX-DS-22: Fraunces is no longer loaded as a font: the wordmark is a drawing', () => {
    expect(readFileSync('src/styles/fonts.css', 'utf8')).not.toMatch(/font-family: 'Fraunces'/);
    expect(readFileSync('src/app/layout.tsx', 'utf8')).not.toMatch(/fraunces/i);
    expect(readdirSync('public/fonts').filter((name) => /fraunces.*\.woff2$/i.test(name))).toEqual(
      [],
    );
  });

  it('UX-DS-8: no type style is uppercase: the eyebrow label is retired', () => {
    expect(tokens.typeStyles.filter((style) => style.textTransform)).toEqual([]);
    expect(renderCss(tokens)).not.toContain('text-transform');
  });

  it('UX-DS-13, UX-DS-15: one control height of 48px, and targets of 44px', () => {
    expect(tokens.sizes['size-control']).toBe('48px');
    expect(tokens.sizes['size-target']).toBe('44px');
    const css = renderCss(tokens);
    expect(css).toContain('--size-control: 48px;');
    expect(css).toContain('--size-target: 44px;');
  });

  it('UX-DS-14: an input is one of three widths: short, medium or its full column', () => {
    expect(Object.keys(tokens.sizes).filter((name) => name.startsWith('size-field-'))).toEqual([
      'size-field-short',
      'size-field-medium',
    ]);
  });

  it('the corners are 8px for chips, 12px for controls, 16px for cards and 24px for sheets', () => {
    expect(tokens.radius).toMatchObject({
      'radius-sm': '8px',
      'radius-md': '12px',
      'radius-lg': '16px',
      'radius-xl': '24px',
    });
  });

  it('flat by default: one soft shadow for what is raised, and one for overlays', () => {
    expect(Object.keys(tokens.shadows)).toEqual(['shadow-raised', 'shadow-overlay']);
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

  it('type sizes are in rem, so they follow the reader’s text size', () => {
    expect(pxToRem('16px')).toBe('1rem');
    expect(pxToRem('13px')).toBe('0.8125rem');
    const css = renderCss(tokens);
    expect(css).toContain('--type-body-size: 1rem;');
    expect(css).toContain('--type-display-mobile-size: 1.75rem;');
    expect(css).not.toMatch(/--type-[a-z0-9-]+-(size|line): \d+px/);
  });

  it('with reduced motion on, every duration is 0ms and nothing animates', () => {
    const css = renderCss(tokens);
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}/.exec(css);
    expect(reduced).not.toBeNull();
    const durations = Object.entries(tokens.motion).filter(([, value]) => /ms$/.test(value));
    expect(durations.map(([name]) => name)).toEqual(['motion-fast', 'motion-base', 'motion-slow']);
    for (const [name] of durations) expect(reduced![1]).toContain(`--${name}: 0ms;`);
  });

  it('UX-DS-20: stylesheets take every duration from the motion tokens, so reduced motion stops them all', () => {
    const untokened: string[] = [];
    for (const file of appStylesheets()) {
      const css = readFileSync(file, 'utf8');
      for (const match of css.matchAll(/(?:transition|animation)[a-z-]*:[^;]*;/g)) {
        if (/\b\d*\.?\d+m?s\b/.test(match[0])) untokened.push(`${file}: ${match[0]}`);
      }
      if (/infinite/.test(css)) untokened.push(`${file}: an animation that loops`);
    }
    expect(untokened).toEqual([]);
  });

  it('UX-DS-5: the contrast list covers every pair the design system promises', () => {
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
    const missing: string[] = [];
    for (const file of appStylesheets()) {
      for (const match of readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(match[1]!)) missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('UX-DS-27: every layout changes at the one breakpoint, 900px, and nowhere else', () => {
    expect(tokens.breakpoint).toBe('900px');
    expect(renderTypeScript(tokens)).toContain('export const breakpointPx = 900;');
    const other: string[] = [];
    for (const file of appStylesheets()) {
      for (const match of readFileSync(file, 'utf8').matchAll(/@media[^{]*\bwidth\b[^{]*/g)) {
        if (!/^@media \(width (<=|>) 900px\) $/.test(match[0])) other.push(`${file}: ${match[0]}`);
      }
    }
    expect(other).toEqual([]);
  });
});

function appStylesheets(): string[] {
  return walk('src').filter((file) => file.endsWith('.css') && !file.endsWith('tokens.css'));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
