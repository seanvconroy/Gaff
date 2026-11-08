/**
 * Design tokens: docs/design-tokens.json is the single source of styling (ADR-0011).
 * This module validates the file, resolves references such as "{atlantic-text}", and renders
 * the generated CSS custom properties and TypeScript token names.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const tokenName = z.string().regex(/^[a-z][a-z0-9-]*$/, 'token names are kebab-case');
const pixels = z.string().regex(/^\d+(\.\d+)?px$/, 'expected a pixel value such as "16px"');
const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const colorValue = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|\{[a-z][a-z0-9-]*\}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/,
    'expected #rrggbb, rgba(r, g, b, a) or {token}',
  );
const DURATION = /^\d+ms$/;
const motionValue = z
  .string()
  .regex(
    /^(\d+ms|cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)|linear|ease|ease-in|ease-out|ease-in-out)$/,
    'expected a duration such as "120ms" or an easing such as "cubic-bezier(0.2, 0, 0, 1)"',
  );
const themed = <T extends z.ZodType>(value: T) => z.object({ light: value, dark: value });

/** WCAG 2.2 AA: text 4.5:1; large text and accent fills 3:1; edges, controls and focus 3:1. */
export const contrastMinimum = { text: 4.5, large: 3, ui: 3 } as const;
export type ContrastRule = keyof typeof contrastMinimum;

export const tokensFileSchema = z.object({
  name: z.string(),
  version: z.number(),
  direction: z.string().optional(),
  color: z.object({
    themes: z.array(z.object({ id: z.enum(['light', 'dark']), name: z.string() })),
    tokens: z
      .array(
        z.object({
          name: tokenName,
          value: themed(colorValue),
          usage: z.string().optional(),
          replaces: tokenName.optional(),
        }),
      )
      .min(1),
  }),
  type: z.object({
    fonts: z.array(z.unknown()),
    families: z.record(tokenName, z.string().min(1)),
    groups: z.array(
      z.object({
        name: z.string(),
        family: tokenName,
        styles: z.array(
          z.object({
            name: tokenName,
            fontSize: pixels,
            lineHeight: pixels,
            fontWeight: z.number().int().min(100).max(1000),
            letterSpacing: z
              .string()
              .regex(/^-?\d*\.?\d+(em|px)$/)
              .optional(),
            textTransform: z.enum(['uppercase', 'lowercase', 'capitalize', 'none']).optional(),
            sample: z.string().optional(),
            usage: z.string().optional(),
          }),
        ),
      }),
    ),
  }),
  spacing: z.object({
    tokens: z.array(z.object({ name: tokenName, value: pixels, usage: z.string().optional() })),
  }),
  radius: z.object({
    tokens: z.array(z.object({ name: tokenName, value: pixels, usage: z.string().optional() })),
  }),
  shadow: z.object({
    tokens: z.array(
      z.object({ name: tokenName, value: themed(z.string().min(1)), usage: z.string().optional() }),
    ),
  }),
  motion: z.object({
    tokens: z.array(
      z.object({ name: tokenName, value: motionValue, usage: z.string().optional() }),
    ),
    reducedMotion: z.string().optional(),
  }),
  contrast: z.object({
    rules: z.record(z.enum(['text', 'large', 'ui']), z.string()),
    pairs: z
      .array(
        z.object({
          fg: tokenName,
          bg: tokenName,
          rule: z.enum(['text', 'large', 'ui']),
          light: z.number().positive(),
          dark: z.number().positive(),
        }),
      )
      .min(1),
  }),
});

export type TokensFile = z.infer<typeof tokensFileSchema>;
export type Theme = 'light' | 'dark';

export interface ContrastPair {
  fg: string;
  bg: string;
  rule: ContrastRule;
  /** The ratios the tokens file records, as shown in the design system's table. */
  recorded: Record<Theme, number>;
}

export interface ResolvedTokens {
  colors: Record<string, Record<Theme, string>>;
  families: Record<string, string>;
  typeStyles: Array<{
    name: string;
    family: string;
    fontSize: string;
    lineHeight: string;
    fontWeight: number;
    letterSpacing?: string;
    textTransform?: string;
  }>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadows: Record<string, Record<Theme, string>>;
  motion: Record<string, string>;
  contrastPairs: ContrastPair[];
}

export const TOKENS_PATH = 'docs/design-tokens.json';

export function loadTokens(path = TOKENS_PATH): ResolvedTokens {
  return resolveTokens(parseTokens(JSON.parse(readFileSync(path, 'utf8'))));
}

export function parseTokens(json: unknown): TokensFile {
  const result = tokensFileSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`design-tokens.json is not valid:\n${issues}`);
  }
  return result.data;
}

export function resolveTokens(file: TokensFile): ResolvedTokens {
  const raw = new Map(file.color.tokens.map((token) => [token.name, token.value]));
  const resolveColor = (name: string, theme: Theme, seen: string[]): string => {
    const value = raw.get(name)?.[theme];
    if (value === undefined) {
      throw new Error(`Colour token "${seen.at(-1) ?? name}" refers to unknown token "${name}"`);
    }
    const reference = /^\{(.+)\}$/.exec(value)?.[1];
    if (!reference) return value.toLowerCase();
    if (seen.includes(reference)) {
      throw new Error(
        `Colour tokens refer to each other in a loop: ${[...seen, reference].join(' → ')}`,
      );
    }
    return resolveColor(reference, theme, [...seen, reference]);
  };

  const colors: ResolvedTokens['colors'] = {};
  for (const token of file.color.tokens) {
    colors[token.name] = {
      light: resolveColor(token.name, 'light', [token.name]),
      dark: resolveColor(token.name, 'dark', [token.name]),
    };
  }

  const typeStyles = file.type.groups.flatMap((group) => {
    if (!(group.family in file.type.families)) {
      throw new Error(`Type group "${group.name}" uses unknown family "${group.family}"`);
    }
    return group.styles.map((style) => ({
      name: style.name,
      family: group.family,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      ...(style.letterSpacing ? { letterSpacing: style.letterSpacing } : {}),
      ...(style.textTransform ? { textTransform: style.textTransform } : {}),
    }));
  });

  // Every pair must name real colours that are solid (a contrast ratio needs opaque colours).
  const contrastPairs = file.contrast.pairs.map((pair) => {
    for (const name of [pair.fg, pair.bg]) {
      const value = colors[name];
      if (!value)
        throw new Error(`Contrast pair ${pair.fg}/${pair.bg} uses unknown token "${name}"`);
      if (!HEX.test(value.light) || !HEX.test(value.dark)) {
        throw new Error(`Contrast pair ${pair.fg}/${pair.bg}: "${name}" is not a solid colour`);
      }
    }
    return {
      fg: pair.fg,
      bg: pair.bg,
      rule: pair.rule,
      recorded: { light: pair.light, dark: pair.dark },
    };
  });

  return {
    colors,
    families: file.type.families,
    typeStyles,
    spacing: Object.fromEntries(file.spacing.tokens.map((t) => [t.name, t.value])),
    radius: Object.fromEntries(file.radius.tokens.map((t) => [t.name, t.value])),
    shadows: Object.fromEntries(file.shadow.tokens.map((t) => [t.name, t.value])),
    motion: Object.fromEntries(file.motion.tokens.map((t) => [t.name, t.value])),
    contrastPairs,
  };
}

const HEADER =
  'Generated by scripts/build-tokens.ts from docs/design-tokens.json. Do not edit: run `pnpm tokens`.';

/** Type sizes are in rem (16px = 1rem), so they follow the reader's browser text size. */
export function pxToRem(px: string): string {
  return `${parseFloat(px) / 16}rem`;
}

function themeBlock(tokens: ResolvedTokens, theme: Theme): string[] {
  return [
    `  color-scheme: ${theme};`,
    ...Object.entries(tokens.colors).map(([name, value]) => `  --color-${name}: ${value[theme]};`),
    ...Object.entries(tokens.shadows).map(([name, value]) => `  --${name}: ${value[theme]};`),
  ];
}

export function renderCss(tokens: ResolvedTokens): string {
  const lines: string[] = [`/* ${HEADER} */`, '', ':root {'];
  for (const [family, stack] of Object.entries(tokens.families)) {
    lines.push(`  --font-${family}: ${stack};`);
  }
  for (const style of tokens.typeStyles) {
    lines.push(`  --type-${style.name}-family: var(--font-${style.family});`);
    lines.push(`  --type-${style.name}-size: ${pxToRem(style.fontSize)};`);
    lines.push(`  --type-${style.name}-line: ${pxToRem(style.lineHeight)};`);
    lines.push(`  --type-${style.name}-weight: ${style.fontWeight};`);
    lines.push(`  --type-${style.name}-tracking: ${style.letterSpacing ?? 'normal'};`);
    if (style.textTransform) {
      lines.push(`  --type-${style.name}-transform: ${style.textTransform};`);
    }
  }
  for (const [name, value] of Object.entries(tokens.spacing)) lines.push(`  --${name}: ${value};`);
  for (const [name, value] of Object.entries(tokens.radius)) lines.push(`  --${name}: ${value};`);
  for (const [name, value] of Object.entries(tokens.motion)) lines.push(`  --${name}: ${value};`);
  lines.push('}', '');

  lines.push(':root,', ':root[data-theme="light"] {', ...themeBlock(tokens, 'light'), '}', '');
  lines.push(
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    ...themeBlock(tokens, 'dark').map((line) => `  ${line}`),
    '  }',
    '}',
    '',
  );
  lines.push(':root[data-theme="dark"] {', ...themeBlock(tokens, 'dark'), '}', '');

  // Reduced motion: every duration drops to 0ms, so nothing animates.
  const durations = Object.entries(tokens.motion).filter(([, value]) => DURATION.test(value));
  if (durations.length > 0) {
    lines.push(
      '@media (prefers-reduced-motion: reduce) {',
      '  :root {',
      ...durations.map(([name]) => `    --${name}: 0ms;`),
      '  }',
      '}',
      '',
    );
  }

  for (const style of tokens.typeStyles) {
    lines.push(
      `.type-${style.name} {`,
      `  font-family: var(--type-${style.name}-family);`,
      `  font-size: var(--type-${style.name}-size);`,
      `  line-height: var(--type-${style.name}-line);`,
      `  font-weight: var(--type-${style.name}-weight);`,
      `  letter-spacing: var(--type-${style.name}-tracking);`,
      ...(style.textTransform ? [`  text-transform: var(--type-${style.name}-transform);`] : []),
      '}',
      '',
    );
  }
  return lines.join('\n');
}

export function renderTypeScript(tokens: ResolvedTokens): string {
  const list = (values: string[]) => `[${values.map((v) => `'${v}'`).join(', ')}] as const`;
  return [
    `// ${HEADER}`,
    '',
    `export const colorTokens = ${list(Object.keys(tokens.colors))};`,
    'export type ColorToken = (typeof colorTokens)[number];',
    '',
    `export const typeStyles = ${list(tokens.typeStyles.map((s) => s.name))};`,
    'export type TypeStyle = (typeof typeStyles)[number];',
    '',
    `export const spaceTokens = ${list(Object.keys(tokens.spacing))};`,
    'export type SpaceToken = (typeof spaceTokens)[number];',
    '',
    `export const radiusTokens = ${list(Object.keys(tokens.radius))};`,
    'export type RadiusToken = (typeof radiusTokens)[number];',
    '',
    `export const motionTokens = ${list(Object.keys(tokens.motion))};`,
    'export type MotionToken = (typeof motionTokens)[number];',
    '',
    '/** CSS custom property for a colour token, for the rare place a value is needed in code. */',
    'export const colorVar = (token: ColorToken) => `var(--color-${token})`;',
    '',
  ].join('\n');
}

/** Every custom property name the generated CSS defines. */
export function definedCustomProperties(tokens: ResolvedTokens): Set<string> {
  return new Set([...renderCss(tokens).matchAll(/(--[a-z0-9-]+):/g)].map((match) => match[1]!));
}

// WCAG 2.x contrast.
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) throw new Error(`Contrast needs a solid #rrggbb colour, not "${hex}"`);
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}
