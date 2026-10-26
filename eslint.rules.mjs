// 저장소 공통 린트 규칙 (세팅안 v2 5.3절). 루트 설정(ESLint 10)과 모바일 설정(ESLint 9)이 같이 씁니다.
// 모바일은 eslint-config-expo가 쓰는 eslint-plugin-react가 ESLint 10을 아직 지원하지 않아 ESLint 9를 씁니다.
export const baseRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};
