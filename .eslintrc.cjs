module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: ['dist', '.eslintrc.cjs', '*.config.jsm', '*.config.js'],
  parser: '@typescript-eslint/parser',
  rules: {
    'one-var': 'off',
    '@typescript-eslint/consistent-indexed-object-style': 'off',
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
