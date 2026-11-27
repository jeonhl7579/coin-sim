import { describe, expect, it } from 'vitest';
import { parseKrwMarkets, selectMarkets } from './markets';

// 실제 코인 이름을 저장소에 넣지 않는다 (D-56). 가짜 마켓만 쓴다.
const RAW = [
  { market: 'KRW-CCC', korean_name: '씨씨씨', english_name: 'Ccc' },
  {
    market: 'BTC-AAA',
    korean_name: '에이에이에이',
    english_name: 'Aaa',
    market_event: { warning: false },
  },
  {
    market: 'KRW-AAA',
    korean_name: '에이에이에이',
    english_name: 'Aaa',
    market_event: { warning: true, caution: { PRICE_FLUCTUATIONS: false } },
  },
  { market: 'USDT-BBB', korean_name: '비비비', english_name: 'Bbb' },
  { market: 'KRW-BBB', korean_name: '비비비', english_name: 'Bbb', market_event: {} },
];

describe('parseKrwMarkets', () => {
  it('원화 마켓만 골라 market 오름차순으로 돌려준다', () => {
    expect(parseKrwMarkets(RAW)).toEqual([
      { market: 'KRW-AAA', koreanName: '에이에이에이', englishName: 'Aaa', warning: true },
      { market: 'KRW-BBB', koreanName: '비비비', englishName: 'Bbb', warning: false },
      { market: 'KRW-CCC', koreanName: '씨씨씨', englishName: 'Ccc', warning: false },
    ]);
  });

  it('market_event가 없으면 유의 종목이 아니다', () => {
    const [ccc] = parseKrwMarkets([RAW[0]]);
    expect(ccc?.warning).toBe(false);
  });

  it('배열이 아니면 예외', () => {
    expect(() => parseKrwMarkets({ error: { name: 404 } })).toThrow('배열이 아니다');
  });

  it('필드가 빠진 항목이 있으면 예외', () => {
    expect(() => parseKrwMarkets([{ market: 'KRW-AAA', korean_name: '에이' }])).toThrow(
      '0번째 항목',
    );
  });
});

describe('selectMarkets', () => {
  const all = parseKrwMarkets(RAW);

  it('요청이 없으면 전체', () => {
    expect(selectMarkets(all)).toEqual({ ok: true, markets: all });
  });

  it('요청한 마켓만 목록 순서대로', () => {
    const result = selectMarkets(all, ['KRW-CCC', 'KRW-AAA']);
    expect(result.ok && result.markets.map((m) => m.market)).toEqual(['KRW-AAA', 'KRW-CCC']);
  });

  it('목록에 없는 코드가 있으면 실패하고 그 코드를 알려준다', () => {
    expect(selectMarkets(all, ['KRW-AAA', 'KRW-ZZZ', 'BTC-AAA'])).toEqual({
      ok: false,
      unknown: ['KRW-ZZZ', 'BTC-AAA'],
    });
  });
});
