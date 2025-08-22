import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Chrome Extension APIs
        chrome: 'readonly',
        browser: 'readonly',

        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        navigator: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',

        // Node globals for build scripts
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      prettier: prettier,
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // Code quality rules
      'no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off', // Allow console in extension development
      'no-debugger': 'warn',
      'no-alert': 'warn',

      // Best practices
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-assign': 'error',
      'no-self-compare': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-return': 'error',
      'prefer-promise-reject-errors': 'error',

      // Variables
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-undef-init': 'error',

      // ES6+
      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'template-curly-spacing': ['error', 'never'],
      'arrow-spacing': ['error', { before: true, after: true }],

      // Async/await
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'warn',

      // Chrome Extension specific
      'no-undef': 'error', // Important for catching undefined Chrome APIs
    },
  },
  {
    // Test files configuration
    files: ['src/**/*.test.js', 'src/**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        // Jest globals
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',

        // jsdom globals
        window: 'readonly',
        document: 'readonly',
      },
    },
    rules: {
      // Relax some rules for tests
      'no-unused-expressions': 'off',
      'prefer-arrow-callback': 'off', // Allow regular functions in test suites
    },
  },
  {
    // Config files
    files: ['*.config.js', '*.config.mjs', 'eslint.config.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off', // Config files might use special globals
    },
  },
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'coverage/**/*', '*.zip', 'raw-assets/**/*'],
  },
];
