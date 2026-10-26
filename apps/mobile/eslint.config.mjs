// 모바일은 eslint-config-expo 위에 저장소 공통 규칙(baseRules)을 얹습니다.
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

import { baseRules } from '../../eslint.rules.mjs';

export default defineConfig([
  expoConfig,
  // 설정 파일 자체는 린트하지 않음 (import 리졸버가 .mjs 설정 파일을 읽지 못함)
  { ignores: ['dist/**', '.expo/**', 'node_modules/**', 'eslint.config.mjs'] },
  { files: ['**/*.ts', '**/*.tsx'], rules: baseRules },
]);
