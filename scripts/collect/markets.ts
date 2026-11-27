// 원화 마켓 목록 (data-spec 2.3)

export interface MarketEntry {
  market: string;
  koreanName: string;
  englishName: string;
  warning: boolean;
}

export interface MarketsFile {
  fetchedAt: string;
  markets: MarketEntry[];
}

const KRW_PREFIX = 'KRW-';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readWarning(item: Record<string, unknown>): boolean {
  const event = item.market_event;
  return isRecord(event) && event.warning === true;
}

/** `/market/all` 응답에서 원화 마켓만 골라 market 오름차순으로 돌려준다. 형식이 다르면 예외. */
export function parseKrwMarkets(raw: unknown): MarketEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error('마켓 목록 응답이 배열이 아니다');
  }
  const markets = raw.map((item: unknown, i): MarketEntry => {
    if (
      !isRecord(item) ||
      typeof item.market !== 'string' ||
      typeof item.korean_name !== 'string' ||
      typeof item.english_name !== 'string'
    ) {
      throw new Error(`마켓 목록 응답 ${i}번째 항목의 형식이 다르다`);
    }
    return {
      market: item.market,
      koreanName: item.korean_name,
      englishName: item.english_name,
      warning: readWarning(item),
    };
  });
  return markets
    .filter((m) => m.market.startsWith(KRW_PREFIX))
    .sort((a, b) => (a.market < b.market ? -1 : a.market > b.market ? 1 : 0));
}

export type SelectResult = { ok: true; markets: MarketEntry[] } | { ok: false; unknown: string[] };

/** 수집 대상을 고른다. requested가 없으면 전체. 목록에 없는 코드가 하나라도 있으면 실패. */
export function selectMarkets(all: MarketEntry[], requested?: string[]): SelectResult {
  if (requested === undefined) {
    return { ok: true, markets: all };
  }
  const wanted = new Set(requested);
  const byCode = new Map(all.map((m) => [m.market, m]));
  const unknown = [...wanted].filter((code) => !byCode.has(code));
  if (unknown.length > 0) {
    return { ok: false, unknown };
  }
  return { ok: true, markets: all.filter((m) => wanted.has(m.market)) };
}
