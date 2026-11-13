// ESLint — 타입 검사(tsc)와 흔적 검사(scripts/quality-scan.mjs)가 못 보는 것을 본다:
// React 훅 규칙(렌더 중 ref 쓰기, effect 안 setState, 의존성 빠짐), 접근성(jsx-a11y), 안 쓰는 변수.
// 도입 전부터 있던 위반은 eslint-suppressions.json에 묶어 두었다. CI는 "새로 생긴 위반"만 막는다.
// 묶인 위반을 고쳤으면 `npm run lint -- --prune-suppressions`로 그 줄을 지운다(품질 관리자).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'docs', 'reports', '.stryker-tmp'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    // 검사 스크립트는 Node에서 돌고, Playwright로 페이지 안에 넣는 함수는 브라우저 전역을 쓴다
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
)
