// 업비트 원화 마켓 1시간 캔들 수집 → data/raw/ (data-spec 2장)
// 실행: npm run collect [-- --markets KRW-BTC,KRW-ETH] [--markets-only]
// 종료 코드: 0 = 성공, 1 = 실패

import { fileURLToPath } from 'node:url';
import { parseCliArgs } from './collect/cli';
import { parseKrwMarkets, selectMarkets, type MarketsFile } from './collect/markets';
import { writeJsonAtomic } from './collect/storage';
import { createUpbitClient } from './collect/upbit';

const RAW_DIR = fileURLToPath(new URL('../data/raw/', import.meta.url));
const MARKETS_FILE = `${RAW_DIR}markets.json`;

/** 초 단위 UTC ISO 8601 (예: 2026-11-28T04:12:00Z) */
function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    console.error(`[collect] 옵션 오류: ${parsed.reason}`);
    return 1;
  }
  const { options } = parsed;

  const client = createUpbitClient();
  const fetchedAt = nowIso();
  const all = parseKrwMarkets(await client.fetchMarketList());
  const file: MarketsFile = { fetchedAt, markets: all };
  await writeJsonAtomic(MARKETS_FILE, file);
  const warned = all.filter((m) => m.warning).length;
  console.log(
    `[collect] 원화 마켓 ${all.length}개 (유의 종목 ${warned}개) → data/raw/markets.json`,
  );

  const selected = selectMarkets(all, options.markets);
  if (!selected.ok) {
    console.error(`[collect] 지금 원화 마켓 목록에 없는 코드: ${selected.unknown.join(', ')}`);
    return 1;
  }
  console.log(`[collect] 수집 대상 ${selected.markets.length}개`);

  if (options.marketsOnly) {
    return 0;
  }
  // 캔들 수집은 4.2~4.4에서 추가한다
  console.error('[collect] 캔들 수집은 아직 구현하지 않았다. --markets-only로 실행한다');
  return 1;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`[collect] 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
