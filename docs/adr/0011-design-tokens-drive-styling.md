# ADR-0011: Design tokens drive all styling

- Status: Accepted
- Date: 2026-10-31

## Context

The design system is a first version built from the pitch deck. "Gaff" is a working name and there's no logo yet. We want to re-skin by replacing one file, and we need WCAG 2.2 AA to hold whatever the tokens are.

## Decision

- `docs/design-tokens.json` is the only place colours, fonts, type styles, spacing, radii and shadows are defined.
- `pnpm tokens` validates the file against a schema, resolves references such as `{brick}`, and generates:
  - `src/styles/tokens.css`: custom properties such as `--color-ink`, `--space-4`, `--radius-lg`, `--font-display`, `--type-body-size` and `--shadow-overlay`. Light values are the default, dark values follow `prefers-color-scheme`, and a `data-theme` attribute overrides both. It also generates one class per type style, such as `.type-heading` and `.type-label`.
  - `src/styles/tokens.ts`: the token names as TypeScript types.
- The generated files are committed, so a re-skin shows up as a readable diff. CI fails if they're out of date.
- Components use CSS Modules that reference only `var(--…)`.
- **Stylelint** rejects literal colours, font families, font sizes, line heights, spacing, radii and shadows. **ESLint** rejects inline `style` props.
- **A contrast test** checks the pairs the design system promises, in both themes. Text and secondary text must reach 4.5:1 on every surface, and `brick-text` must too. `border-strong` and the focus ring must reach 3:1 against surfaces. `ink-inverse` must reach 4.5:1 on `primary` and `forest`.
- Fonts (Fraunces and DM Sans) are self-hosted. Renters' devices never call Google.

## Consequences

- To re-skin: replace the JSON (and the font files, if the families change), run `pnpm tokens`, and commit. If the new palette fails contrast, CI says which pair.
- Nobody can sneak in a one-off colour or spacing value; the linters catch it.
- Token names in CSS mirror the JSON, so designers and developers use the same words.

## Alternatives considered

- **Tailwind v4 with a generated theme.** Workable, but the default palette and spacing scale would need stripping out, and arbitrary values (`p-[13px]`) need extra linting. CSS Modules plus custom properties is plainer.
- **CSS-in-JS.** Adds runtime cost and fights server rendering.
