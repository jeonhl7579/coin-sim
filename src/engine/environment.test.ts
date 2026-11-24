import { describe, expect, it } from 'vitest';

// engine·game 테스트가 DOM 없는 node 환경에서 도는지 지킨다 (vite.config.ts의 core 프로젝트)
describe('core 테스트 환경', () => {
  it('DOM 전역이 없다', () => {
    expect(typeof globalThis.window).toBe('undefined');
    expect(typeof globalThis.document).toBe('undefined');
  });
});
