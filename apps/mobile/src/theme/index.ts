// tokens.js는 tailwind.config.js와 같이 쓰려고 JS로 둔다
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokens = require('./tokens') as {
  colors: Record<
    | 'cream'
    | 'cream-2'
    | 'line'
    | 'brand'
    | 'brand-2'
    | 'mint'
    | 'ink'
    | 'sub'
    | 'night'
    | 'sun'
    | 'danger'
    | 'blue',
    string
  >;
};

export const C = tokens.colors;
