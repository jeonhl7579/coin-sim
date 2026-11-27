import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './cli';

describe('parseCliArgs', () => {
  it('옵션이 없으면 전체 마켓, 캔들까지 수집', () => {
    expect(parseCliArgs([])).toEqual({ ok: true, options: { marketsOnly: false } });
  });

  it('--markets는 쉼표로 나누고 공백·빈 값·중복을 없앤다', () => {
    expect(parseCliArgs(['--markets', ' KRW-AAA, ,KRW-BBB,KRW-AAA'])).toEqual({
      ok: true,
      options: { markets: ['KRW-AAA', 'KRW-BBB'], marketsOnly: false },
    });
  });

  it('--markets-only', () => {
    expect(parseCliArgs(['--markets-only'])).toEqual({
      ok: true,
      options: { marketsOnly: true },
    });
  });

  it('--markets 값이 비어 있으면 실패', () => {
    const result = parseCliArgs(['--markets', ' , ']);
    expect(result.ok).toBe(false);
  });

  it('모르는 옵션과 위치 인자는 실패', () => {
    expect(parseCliArgs(['--market', 'KRW-AAA']).ok).toBe(false);
    expect(parseCliArgs(['KRW-AAA']).ok).toBe(false);
  });
});
