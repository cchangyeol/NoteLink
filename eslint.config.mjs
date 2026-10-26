// 저장소 공통 ESLint 설정 (apps/api, packages/shared). 모바일은 apps/mobile/eslint.config.mjs를 씁니다.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

import { baseRules } from './eslint.rules.mjs';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/mobile/**', 'apps/ai/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: baseRules },
);
