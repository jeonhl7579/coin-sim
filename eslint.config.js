// CLAUDE.md와 decisions.md의 규칙을 도구로 강제한다. 규칙을 바꾸면 conventions.md 2장도 고친다.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ── 계층 (D-23) ─────────────────────────────────────────────
// 아래에서 위 순서. allow = 값 import를 허용하는 아래 계층 (같은 계층은 항상 허용).
// 위 계층은 타입도 금지, allow에 없는 아래 계층은 `import type`만 허용.
const LAYERS = [
  { name: 'config', files: ['src/config/**'], allow: [] },
  { name: 'engine', files: ['src/engine/**'], allow: ['config'] },
  { name: 'game', files: ['src/game/**'], allow: ['engine', 'config'] },
  { name: 'store', files: ['src/store/**'], allow: ['game'] },
  { name: 'components', files: ['src/components/**'], allow: ['store'] },
  { name: 'pages', files: ['src/pages/**'], allow: ['components', 'store'] },
  { name: 'app', files: ['src/main.tsx', 'src/router.tsx'], allow: ['pages'] },
];
const MODULE_PATHS = {
  config: ['@/config', '@/config/**'],
  engine: ['@/engine', '@/engine/**'],
  game: ['@/game', '@/game/**'],
  store: ['@/store', '@/store/**'],
  components: ['@/components', '@/components/**'],
  pages: ['@/pages', '@/pages/**'],
  app: ['@/main', '@/router'],
};
const PURE_LAYERS = ['config', 'engine', 'game'];
const UI_LIBS = [
  'react',
  'react/**',
  'react-dom',
  'react-dom/**',
  'zustand',
  'zustand/**',
  'react-router',
  'react-router/**',
];

function importPatterns(layerIndex) {
  const layer = LAYERS[layerIndex];
  const patterns = [
    { group: ['../*', '../**'], message: '폴더 밖은 `@/`로 import한다 (계층 규칙 우회 방지).' },
  ];
  LAYERS.forEach((other, i) => {
    if (i > layerIndex) {
      patterns.push({
        group: MODULE_PATHS[other.name],
        message: `${layer.name}은(는) 위 계층 ${other.name}을(를) import할 수 없다. 타입도 금지 (D-23).`,
      });
    } else if (i < layerIndex && !layer.allow.includes(other.name)) {
      patterns.push({
        group: MODULE_PATHS[other.name],
        allowTypeImports: true,
        message: `${layer.name}은(는) ${other.name}을(를) 건너뛰어 값을 import할 수 없다. \`import type\`만 허용 (D-23).`,
      });
    }
  });
  if (PURE_LAYERS.includes(layer.name)) {
    patterns.push({
      group: UI_LIBS,
      message: 'engine·game·config는 React, Zustand, React Router를 쓰지 않는다.',
    });
  }
  return patterns;
}

// ── 금지 속성·전역·문법 ──────────────────────────────────────
// 같은 규칙을 여러 설정 객체에 쓰면 뒤의 것이 앞의 것을 덮으므로, 파일 묶음마다 전체 목록을 만든다.
const RANDOM_AND_TIME = [
  { object: 'Math', property: 'random', message: '난수는 rng.ts를 주입받는다.' },
  { object: 'Date', property: 'now', message: '시간은 경과 시간을 인자로 받는다.' },
];
const ROUNDING = ['round', 'floor', 'ceil', 'trunc'].map((property) => ({
  object: 'Math',
  property,
  message: '반올림은 src/game/money.ts에서만 한다 (D-33).',
}));
const STORAGE_PROPS = ['window', 'globalThis'].flatMap((object) =>
  ['localStorage', 'sessionStorage'].map((property) => ({
    object,
    property,
    message: 'localStorage는 store/recordsStorage.ts, sessionStorage는 main.tsx에서만 쓴다 (D-24).',
  })),
);
const storageGlobal = (name) => ({
  name,
  message: 'localStorage는 store/recordsStorage.ts, sessionStorage는 main.tsx에서만 쓴다 (D-24).',
});
const DOM_GLOBALS = ['window', 'document'].map((name) => ({
  name,
  message: 'engine·game·config는 DOM을 쓰지 않는다.',
}));

const COMMON_SYNTAX = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: '뉴스와 기록은 텍스트로만 렌더링한다.',
  },
  { selector: 'ExportDefaultDeclaration', message: '이름 붙인 export만 쓴다 (D-39).' },
];
const CURRENT_TIME_SYNTAX = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: '현재 시각을 쓰지 않는다. 시간은 인자로 받는다.',
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: '현재 시각을 쓰지 않는다. 시간은 인자로 받는다.',
  },
];

const SRC_TS = '**/*.{ts,tsx}';
const PURE_FILES = ['src/config/**', 'src/engine/**', 'src/game/**'];

export default defineConfig(
  { ignores: ['dist', 'coverage', 'design', 'data', 'analysis', '.venv'] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  { files: ['*.{js,ts}', 'scripts/**'], languageOptions: { globals: globals.node } },

  // ── src 공통 ──
  {
    files: [`src/${SRC_TS}`, `tests/${SRC_TS}`],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
    rules: { 'no-restricted-syntax': ['error', ...COMMON_SYNTAX] },
  },

  // ── 계층 import ──
  ...LAYERS.map((layer, i) => ({
    files: layer.files,
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            ...importPatterns(i),
            { group: ['@tests/**'], message: '@tests는 테스트 파일에서만 import한다.' },
          ],
        },
      ],
    },
  })),
  // 테스트 파일은 tests/fixtures를 @tests로 가져올 수 있다
  ...LAYERS.map((layer, i) => ({
    files: layer.files.filter((f) => f.endsWith('/**')).map((f) => `${f}/*.test.{ts,tsx}`),
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: importPatterns(i) }],
    },
  })).filter((config) => config.files.length > 0),

  // ── 금지 속성·전역·문법 (파일 묶음별 전체 목록) ──
  {
    files: ['src/store/**', 'src/components/**', 'src/pages/**', 'src/main.tsx', 'src/router.tsx'],
    rules: {
      'no-restricted-properties': ['error', ...ROUNDING, ...STORAGE_PROPS],
      'no-restricted-globals': [
        'error',
        storageGlobal('localStorage'),
        storageGlobal('sessionStorage'),
      ],
    },
  },
  {
    files: ['src/store/recordsStorage.ts'],
    rules: { 'no-restricted-globals': ['error', storageGlobal('sessionStorage')] },
  },
  {
    files: ['src/main.tsx'],
    rules: { 'no-restricted-globals': ['error', storageGlobal('localStorage')] },
  },
  {
    files: PURE_FILES,
    rules: {
      'no-restricted-properties': ['error', ...RANDOM_AND_TIME, ...ROUNDING, ...STORAGE_PROPS],
      'no-restricted-globals': [
        'error',
        ...DOM_GLOBALS,
        storageGlobal('localStorage'),
        storageGlobal('sessionStorage'),
      ],
      'no-restricted-syntax': ['error', ...COMMON_SYNTAX, ...CURRENT_TIME_SYNTAX],
    },
  },
  // engine은 난수 범위 계산에, money.ts는 금액 반올림에 Math.floor 등을 쓴다 (D-33)
  {
    files: ['src/engine/**', 'src/game/money.ts'],
    rules: { 'no-restricted-properties': ['error', ...RANDOM_AND_TIME, ...STORAGE_PROPS] },
  },

  // ── barrel 파일 금지 (D-35) ──
  {
    files: ['src/**/index.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Program', message: 'barrel 파일(index.ts)을 만들지 않는다 (D-35).' },
      ],
    },
  },

  prettier,
);
