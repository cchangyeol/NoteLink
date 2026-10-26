import type { INestApplication } from '@nestjs/common';

/** main.ts와 테스트가 같은 설정을 쓰도록 모아 둡니다. 주소는 /api/v1/... (README 5장) */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
}
