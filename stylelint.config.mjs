// ADR-0011: design tokens drive all styling. Raw colours, type, spacing, radii and
// shadows are rejected; use the custom properties generated from docs/design-tokens.json.
const tokenMessage = (property) =>
  `Use a design token for ${property}: var(--…) from src/styles/tokens.css (ADR-0011).`;

const config = {
  extends: ['stylelint-config-standard', 'stylelint-config-css-modules'],
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: ['src/styles/tokens.css', 'src/styles/fonts.css'],
  rules: {
    'color-no-hex': [true, { message: tokenMessage('colour') }],
    'color-named': ['never', { message: tokenMessage('colour') }],
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color-mix'],
      { message: tokenMessage('colour') },
    ],
    'scale-unlimited/declaration-strict-value': [
      [
        '/color$/',
        'fill',
        'stroke',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'border-radius',
        'box-shadow',
        '/^margin/',
        '/^padding/',
        'gap',
        'row-gap',
        'column-gap',
      ],
      {
        expandShorthand: true,
        ignoreValues: [
          '0',
          'auto',
          'inherit',
          'initial',
          'unset',
          'none',
          'normal',
          'transparent',
          'currentColor',
          'currentcolor',
        ],
        message: tokenMessage('${property}'),
      },
    ],
    // Global stylesheets use kebab-case utility classes (.type-body, .visually-hidden).
    'selector-class-pattern': null,
    'custom-property-pattern': null,
  },
  overrides: [
    {
      files: ['**/*.module.css'],
      rules: {
        'selector-class-pattern': [
          '^[a-z][a-zA-Z0-9]*$',
          { message: 'Use camelCase class names in CSS Modules.' },
        ],
      },
    },
  ],
};

export default config;
