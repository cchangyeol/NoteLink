import { describe, expect, it } from 'vitest';

import { apiErrorSchema } from './api-error.js';

describe('apiErrorSchema', () => {
  it('code와 message가 있으면 통과한다', () => {
    expect(apiErrorSchema.parse({ code: 'NOT_FOUND', message: '없음' })).toEqual({
      code: 'NOT_FOUND',
      message: '없음',
    });
  });

  it('code가 비어 있으면 거부한다', () => {
    expect(apiErrorSchema.safeParse({ code: '', message: '없음' }).success).toBe(false);
  });
});
