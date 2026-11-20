// ESLint flat config. Formatting is Prettier's job (eslint-config-prettier turns off clashing rules).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // The simulation is pure and deterministic: no DOM, no UI imports, no unseeded randomness or clocks.
  {
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['../ui', '../ui/*'], message: 'src/sim must not import from src/ui.' }] }],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The simulation has no DOM.' },
        { name: 'document', message: 'The simulation has no DOM.' },
        { name: 'localStorage', message: 'Saving is the UI’s job.' },
        { name: 'performance', message: 'No clocks in the simulation: it must be deterministic.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts.' },
        { object: 'Date', property: 'now', message: 'No clocks in the simulation: it must be deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'No clocks in the simulation: it must be deterministic.' },
      ],
    },
  },
  // Scripts and tests may log.
  { files: ['scripts/**', 'tests/**'], rules: { 'no-console': 'off' } },
  prettier,
);
