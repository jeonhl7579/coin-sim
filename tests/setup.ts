// ui 프로젝트(jsdom) 공용 설정
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetGameStore } from '@/store/gameStore';

afterEach(() => {
  cleanup();
  resetGameStore(); // D-29
});
