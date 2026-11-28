import { describe, expect, it } from 'vitest';
import fixture from '@tests/fixtures/stats.small.json';
import { SCHEMA_VERSION, type StatsFile } from './statsSchema';

// 타입 검사: fixture가 StatsFile 구조와 맞지 않으면 typecheck가 실패한다.
// fixture는 data/stats/stats.json과 같은 코드로 만들고 조각만 줄인 것이다 (analysis/export.py).
const stats: StatsFile = fixture;

const STATES = ['bull', 'bear', 'sideways'] as const;
const ARCHETYPES = ['leader', 'large', 'mid', 'small'] as const;

describe('통계 fixture와 계약 (data-spec 4장)', () => {
  it('스키마 버전이 엔진이 기대하는 값과 같다', () => {
    expect(stats.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('분위수의 p는 meta.quantileGrid와 같다', () => {
    const grid = stats.meta.quantileGrid;
    for (const a of ARCHETYPES) {
      expect(stats.archetypes[a].beta.p).toEqual(grid);
      for (const s of STATES) {
        expect(stats.archetypes[a].volatility[s].p).toEqual(grid);
        expect(stats.archetypes[a].wick[s].p).toEqual(grid);
      }
    }
    expect(stats.archetypes.crash.drawdown.p).toEqual(grid);
  });

  it('조각은 36시간이다', () => {
    const pools = [
      ...STATES.map((s) => stats.market.segments[s]),
      ...ARCHETYPES.flatMap((a) => STATES.map((s) => stats.archetypes[a].segments[s])),
      stats.archetypes.crash.segments,
    ];
    for (const pool of pools) {
      expect(pool.length).toBeGreaterThan(0);
      for (const segment of pool) {
        expect(segment).toHaveLength(36);
      }
    }
  });

  it('다음 상태 비율은 상태마다 합이 1이다', () => {
    for (const s of STATES) {
      const total = Object.values(stats.regimes.switch[s]).reduce((sum, v) => sum + v, 0);
      expect(total).toBeCloseTo(1, 3);
    }
  });

  it('전파 시점 비율이 있으면 4개이고 합이 1이다', () => {
    const delay = stats.propagation.delay;
    if (delay !== undefined) {
      expect(delay).toHaveLength(4);
      expect(delay.reduce((sum, v) => sum + v, 0)).toBeCloseTo(1, 3);
    }
  });

  it('실제 이름 해시는 약속한 방식이고 부호 없는 32비트 정수다', () => {
    expect(stats.realNames.normalize).toBe('nfkc-lower-alnum');
    expect(stats.realNames.hash).toBe('fnv1a32');
    for (const value of stats.realNames.values) {
      expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
    }
  });
});
