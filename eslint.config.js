import js from '@eslint/js'
import tseslint from 'typescript-eslint';
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    plugins: {
    },
    rules: {
      'one-var': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      "import/prefer-default-export": "off",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          "allowExpressions": true
        }
      ],
      "max-len": ["error", { "code": 120 }],
      "require-jsdoc" : 0,
      "operator-linebreak": ["error", "before"],
      "arrow-parens": ["error", "as-needed"],
      "one-var-declaration-per-line": ["error", "initializations"],
      "object-curly-spacing": ["error", "always"],
      "indent": [
        2,
        2,
        {
          "CallExpression": {
            "arguments": "first"
          }
        }
      ]
    },
  }
)
