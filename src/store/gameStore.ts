import { create } from 'zustand';

// D-25: 도메인별 store 하나. D-26: store 훅 자체는 export하지 않고,
// 값 하나씩 반환하는 커스텀 훅과 useGameActions()만 export한다.
type GameStoreState = Record<string, never>;

const initialState: GameStoreState = {};

const useGameStore = create<GameStoreState>()(() => initialState);

// D-29: tests/setup.ts에서 테스트마다 호출한다.
export function resetGameStore(): void {
  useGameStore.setState(initialState, true);
}
