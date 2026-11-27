// 수집기 실행 옵션 (data-spec 2.7)

import { parseArgs } from 'node:util';

export interface CollectOptions {
  /** 수집할 마켓 코드. 없으면 전체 원화 마켓 */
  markets?: string[];
  /** 마켓 목록만 받고 끝낸다 */
  marketsOnly: boolean;
}

export type ParseResult = { ok: true; options: CollectOptions } | { ok: false; reason: string };

export function parseCliArgs(argv: string[]): ParseResult {
  let values: { markets?: string; 'markets-only'?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        markets: { type: 'string' },
        'markets-only': { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const marketsOnly = values['markets-only'] ?? false;
  if (values.markets === undefined) {
    return { ok: true, options: { marketsOnly } };
  }
  const markets = [
    ...new Set(
      values.markets
        .split(',')
        .map((code) => code.trim())
        .filter((code) => code !== ''),
    ),
  ];
  if (markets.length === 0) {
    return { ok: false, reason: '--markets에 마켓 코드가 없다 (예: --markets KRW-BTC,KRW-ETH)' };
  }
  return { ok: true, options: { markets, marketsOnly } };
}
