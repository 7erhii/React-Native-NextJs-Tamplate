const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * The `no-restricted-imports` block below is not style enforcement — it is the
 * mechanical guard on the architecture's central rule.
 *
 * Screens and games must depend on ports, never on adapters or vendor SDKs. That
 * boundary is what makes the persistence target swappable, and it is also the
 * boundary that erodes quietly: one `import { supabase }` inside a game screen
 * is enough to make "switch modes by editing one file" false, and nothing else
 * would fail. Lint catches it in seconds; code review catches it sometimes.
 */
const FORBIDDEN_IN_FEATURES = [
  {
    group: ['@supabase/*'],
    message:
      'Do not import the Supabase SDK here. Use platform hooks (useSaveState, useIdentity). ' +
      'Only src/core/supabase/client.ts may touch the SDK.',
  },
  {
    group: ['**/core/supabase/client', '@/core/supabase/client'],
    message: 'Do not use the Supabase client directly. Go through a port.',
  },
  {
    group: ['**/*.adapter', '**/*.adapter.ts', '@/core/identity/*.adapter'],
    message:
      'Do not import an identity adapter directly. Use useIdentity(), which receives whichever ' +
      'adapter the configuration selected.',
  },
  {
    group: [
      '@/core/storage/local.store',
      '@/core/storage/supabase.store',
      '@/core/storage/hybrid.store',
      '**/storage/local.store',
      '**/storage/supabase.store',
      '**/storage/hybrid.store',
    ],
    message:
      'Do not import a storage adapter directly. Use useSaveState(), or getSaveStore() from ' +
      '@/core/storage, which returns the configured adapter.',
  },
  {
    group: ['@react-native-async-storage/*', 'expo-secure-store'],
    message:
      'Do not use device storage directly — it bypasses namespacing, validation, and migration. ' +
      'Use useSaveState().',
  },
];

module.exports = defineConfig([
  expoConfig,

  {
    ignores: [
      'dist/*',
      'node_modules/*',
      'infra/supabase/docker/*',
      '.expo/*',
      'expo-env.d.ts',
    ],
  },

  {
    // Screens, games, and features consume ports only.
    files: ['src/app/**/*.{ts,tsx}', 'src/games/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: FORBIDDEN_IN_FEATURES }],
    },
  },

  {
    // core/ is pure ports and adapters: no React, no navigation.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['expo-router', '@/platform/*', '**/platform/*'],
              message:
                'src/core must not depend on React or the platform layer. Keep the dependency ' +
                'direction platform → core.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    },
  },

  {
    // Scripts are plain Node utilities run outside the app bundle.
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['jest.setup.js', '**/__tests__/**/*.{ts,tsx}', 'src/**/testing/**/*.ts'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        require: 'readonly',
        module: 'writable',
      },
    },
  },
]);
