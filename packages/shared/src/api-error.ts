import { z } from 'zod';

/** API 오류 응답 형식 `{ code, message }` (README 5장 API 규칙) */
export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
